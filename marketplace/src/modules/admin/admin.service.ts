import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Developer, Widget, WidgetStatus, Review } from '../../entities';

/** 开发者管理 + 数据统计看板 */
@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(Developer)
    private readonly developerRepo: Repository<Developer>,
    @InjectRepository(Widget)
    private readonly widgetRepo: Repository<Widget>,
    @InjectRepository(Review)
    private readonly reviewRepo: Repository<Review>,
  ) {}

  // ── 开发者管理 ────────────────────────────

  async listDevelopers(page = 1, limit = 20) {
    const [items, total] = await this.developerRepo.findAndCount({
      skip: (page - 1) * limit,
      take: limit,
      order: { createdAt: 'DESC' },
    });
    const safe = items.map(
      ({ id, email, name, isVerified, website, createdAt }) => ({
        id,
        email,
        name,
        isVerified,
        website,
        createdAt,
      }),
    );
    return { items: safe, total, page, limit };
  }

  async getDeveloper(id: string) {
    const dev = await this.developerRepo.findOne({ where: { id } });
    if (!dev) throw new NotFoundException('Developer not found');

    const widgetCount = await this.widgetRepo.count({
      where: { developerId: id },
    });
    return {
      id: dev.id,
      email: dev.email,
      name: dev.name,
      isVerified: dev.isVerified,
      website: dev.website,
      bio: dev.bio,
      createdAt: dev.createdAt,
      widgetCount,
    };
  }

  async verifyDeveloper(id: string) {
    const dev = await this.developerRepo.findOne({ where: { id } });
    if (!dev) throw new NotFoundException('Developer not found');
    dev.isVerified = true;
    return this.developerRepo.save(dev);
  }

  async unverifyDeveloper(id: string) {
    const dev = await this.developerRepo.findOne({ where: { id } });
    if (!dev) throw new NotFoundException('Developer not found');
    dev.isVerified = false;
    return this.developerRepo.save(dev);
  }

  async deleteDeveloper(id: string) {
    const dev = await this.developerRepo.findOne({ where: { id } });
    if (!dev) throw new NotFoundException('Developer not found');
    // 检查是否有已发布的 widget
    const count = await this.widgetRepo.count({
      where: { developerId: id },
    });
    if (count > 0) {
      throw new BadRequestException(
        `Cannot delete developer with ${count} published widgets`,
      );
    }
    await this.developerRepo.remove(dev);
    return { deleted: true };
  }

  // ── 数据统计看板 ────────────────────────────

  async getDashboardStats() {
    const [
      totalWidgets,
      totalDevelopers,
      pendingReviews,
      approvedWidgets,
      rejectedWidgets,
      totalReviews,
      downloadStats,
    ] = (await Promise.all([
      this.widgetRepo.count(),
      this.developerRepo.count(),
      this.widgetRepo.count({ where: { status: WidgetStatus.PENDING } }),
      this.widgetRepo.count({ where: { status: WidgetStatus.APPROVED } }),
      this.widgetRepo.count({ where: { status: WidgetStatus.REJECTED } }),
      this.reviewRepo.count(),
      this.widgetRepo
        .createQueryBuilder('w')
        .select('SUM(w.downloads)', 'total')
        .getRawOne() as Promise<{ total: string } | null>,
    ])) as [
      number,
      number,
      number,
      number,
      number,
      number,
      { total: string } | null,
    ];

    return {
      widgets: {
        total: totalWidgets,
        approved: approvedWidgets,
        pending: pendingReviews,
        rejected: rejectedWidgets,
      },
      developers: { total: totalDevelopers },
      reviews: { total: totalReviews },
      downloads: { total: parseInt(downloadStats?.total ?? '0', 10) },
    };
  }

  async getCategoryStats() {
    const result = await this.widgetRepo
      .createQueryBuilder('w')
      .select('w.category', 'category')
      .addSelect('COUNT(*)', 'count')
      .addSelect('SUM(w.downloads)', 'downloads')
      .addSelect('AVG(w.rating)', 'avgRating')
      .groupBy('w.category')
      .getRawMany();

    return result.map((r: Record<string, string>) => ({
      category: r.category,
      count: parseInt(r.count, 10),
      downloads: parseInt(r.downloads ?? '0', 10),
      avgRating: parseFloat(parseFloat(r.avgRating ?? '0').toFixed(2)),
    }));
  }

  async getTopWidgets(limit = 10) {
    const widgets = await this.widgetRepo.find({
      where: { status: WidgetStatus.APPROVED },
      order: { downloads: 'DESC' },
      take: limit,
    });
    return widgets.map(({ id, name, slug, downloads, rating, category }) => ({
      id,
      name,
      slug,
      downloads,
      rating,
      category,
    }));
  }

  async getRecentActivity(limit = 20) {
    const widgets = await this.widgetRepo.find({
      order: { createdAt: 'DESC' },
      take: limit,
    });
    return widgets.map(({ id, name, status, createdAt, developerId }) => ({
      type: 'widget_submitted' as const,
      widgetId: id,
      widgetName: name,
      status,
      timestamp: createdAt,
      developerId,
    }));
  }
}
