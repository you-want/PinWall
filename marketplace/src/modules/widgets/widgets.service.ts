import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, FindOptionsWhere } from 'typeorm';
import { Widget, WidgetVersion, WidgetStatus, Review } from '../../entities';
import {
  CreateWidgetDto,
  CreateVersionDto,
  QueryWidgetsDto,
  CreateReviewDto,
} from './widgets.dto';

@Injectable()
export class WidgetsService {
  constructor(
    @InjectRepository(Widget)
    private readonly widgetRepo: Repository<Widget>,
    @InjectRepository(WidgetVersion)
    private readonly versionRepo: Repository<WidgetVersion>,
    @InjectRepository(Review)
    private readonly reviewRepo: Repository<Review>,
  ) {}

  async findAll(query: QueryWidgetsDto) {
    const {
      page = 1,
      limit = 20,
      search,
      category,
      widgetType,
      sortBy,
      order,
    } = query;

    const where: FindOptionsWhere<Widget> = {
      status: WidgetStatus.APPROVED,
    };

    if (search) {
      where.name = Like(`%${search}%`);
    }
    if (category) {
      where.category = category;
    }
    if (widgetType) {
      where.widgetType = widgetType;
    }

    const validSortFields = ['downloads', 'rating', 'createdAt', 'updatedAt'];
    const orderField = validSortFields.includes(sortBy ?? '')
      ? sortBy
      : 'downloads';

    const [items, total] = await this.widgetRepo.findAndCount({
      where,
      order: { [orderField as string]: order ?? 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
      relations: { versions: true },
    });

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(idOrSlug: string) {
    const widget = await this.widgetRepo.findOne({
      where: [{ id: idOrSlug }, { slug: idOrSlug }],
      relations: { versions: true, reviews: true },
    });

    if (!widget) {
      throw new NotFoundException('Widget not found');
    }

    return widget;
  }

  async findVersions(idOrSlug: string) {
    const widget = await this.findOne(idOrSlug);
    return this.versionRepo.find({
      where: { widgetId: widget.id },
      order: { createdAt: 'DESC' },
    });
  }

  async create(dto: CreateWidgetDto, developerId: string) {
    const widget = this.widgetRepo.create({
      ...dto,
      developerId,
      status: WidgetStatus.PENDING,
    });
    return this.widgetRepo.save(widget);
  }

  async createVersion(
    idOrSlug: string,
    dto: CreateVersionDto,
    developerId: string,
  ) {
    const widget = await this.findOne(idOrSlug);

    if (widget.developerId !== developerId) {
      throw new ForbiddenException('You do not own this widget');
    }

    const version = this.versionRepo.create({
      ...dto,
      widgetId: widget.id,
    });
    return this.versionRepo.save(version);
  }

  async incrementDownload(idOrSlug: string) {
    const widget = await this.findOne(idOrSlug);
    await this.widgetRepo.increment({ id: widget.id }, 'downloads', 1);
    return { downloads: widget.downloads + 1 };
  }

  async createReview(idOrSlug: string, dto: CreateReviewDto) {
    const widget = await this.findOne(idOrSlug);

    const review = this.reviewRepo.create({
      ...dto,
      widgetId: widget.id,
    });
    const saved = await this.reviewRepo.save(review);

    await this.updateWidgetRating(widget.id);

    return saved;
  }

  async findReviews(idOrSlug: string) {
    const widget = await this.findOne(idOrSlug);
    return this.reviewRepo.find({
      where: { widgetId: widget.id },
      order: { createdAt: 'DESC' },
    });
  }

  private async updateWidgetRating(widgetId: string) {
    const reviews = await this.reviewRepo.find({ where: { widgetId } });
    if (reviews.length === 0) return;

    const avg = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;

    await this.widgetRepo.update(widgetId, {
      rating: parseFloat(avg.toFixed(2)),
      ratingCount: reviews.length,
    });
  }

  async updateStatus(id: string, status: WidgetStatus) {
    const widget = await this.widgetRepo.findOne({ where: { id } });
    if (!widget) throw new NotFoundException('Widget not found');

    widget.status = status;
    return this.widgetRepo.save(widget);
  }

  async findAllForAdmin(query: QueryWidgetsDto) {
    const { page = 1, limit = 20, search, category, widgetType } = query;

    const where: FindOptionsWhere<Widget> = {};
    if (search) where.name = Like(`%${search}%`);
    if (category) where.category = category;
    if (widgetType) where.widgetType = widgetType;

    const [items, total] = await this.widgetRepo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { items, total, page, limit };
  }
}
