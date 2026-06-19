import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { WidgetsService } from './widgets.service';
import { Widget, WidgetVersion, Review, WidgetStatus } from '../../entities';

describe('WidgetsService', () => {
  let service: WidgetsService;
  let widgetRepo: Record<string, jest.Mock>;
  let versionRepo: Record<string, jest.Mock>;
  let reviewRepo: Record<string, jest.Mock>;

  const mockWidget: Partial<Widget> = {
    id: 'w-1',
    slug: 'test-widget',
    name: 'Test Widget',
    description: 'A test widget',
    author: 'Tester',
    status: WidgetStatus.APPROVED,
    downloads: 100,
    rating: 4.5,
    ratingCount: 10,
    developerId: 'dev-1',
    versions: [],
    reviews: [],
  };

  beforeEach(async () => {
    widgetRepo = {
      findAndCount: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      increment: jest.fn(),
      update: jest.fn(),
    };
    versionRepo = {
      find: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };
    reviewRepo = {
      find: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WidgetsService,
        { provide: getRepositoryToken(Widget), useValue: widgetRepo },
        { provide: getRepositoryToken(WidgetVersion), useValue: versionRepo },
        { provide: getRepositoryToken(Review), useValue: reviewRepo },
      ],
    }).compile();

    service = module.get<WidgetsService>(WidgetsService);
  });

  describe('findAll', () => {
    it('returns paginated widgets', async () => {
      widgetRepo.findAndCount.mockResolvedValue([[mockWidget], 1]);

      const result = await service.findAll({ page: 1, limit: 20 });

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.totalPages).toBe(1);
    });

    it('returns empty list when no widgets', async () => {
      widgetRepo.findAndCount.mockResolvedValue([[], 0]);

      const result = await service.findAll({});

      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });

  describe('findOne', () => {
    it('returns widget by id', async () => {
      widgetRepo.findOne.mockResolvedValue(mockWidget);

      const result = await service.findOne('w-1');
      expect(result.name).toBe('Test Widget');
    });

    it('returns widget by slug', async () => {
      widgetRepo.findOne.mockResolvedValue(mockWidget);

      const result = await service.findOne('test-widget');
      expect(result.slug).toBe('test-widget');
    });

    it('throws NotFoundException when not found', async () => {
      widgetRepo.findOne.mockResolvedValue(null);

      await expect(service.findOne('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('create', () => {
    it('creates a widget with PENDING status', async () => {
      const dto = {
        name: 'New Widget',
        slug: 'new-widget',
        description: 'Desc',
        category: 'utility' as any,
        widgetType: 'community' as any,
      };
      widgetRepo.create.mockReturnValue({ ...dto, developerId: 'dev-1', status: WidgetStatus.PENDING });
      widgetRepo.save.mockResolvedValue({ ...dto, id: 'w-2', developerId: 'dev-1' });

      const result = await service.create(dto, 'dev-1');

      expect(widgetRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ ...dto, developerId: 'dev-1', status: WidgetStatus.PENDING }),
      );
      expect(widgetRepo.save).toHaveBeenCalled();
    });
  });

  describe('createVersion', () => {
    it('creates a version for owned widget', async () => {
      widgetRepo.findOne.mockResolvedValue(mockWidget);
      versionRepo.create.mockReturnValue({ version: '1.1.0', widgetId: 'w-1' });
      versionRepo.save.mockResolvedValue({ id: 'v-1', version: '1.1.0' });

      const result = await service.createVersion('w-1', { version: '1.1.0', packageUrl: 'url' }, 'dev-1');

      expect(result.version).toBe('1.1.0');
    });

    it('throws ForbiddenException when not owner', async () => {
      widgetRepo.findOne.mockResolvedValue(mockWidget);

      await expect(
        service.createVersion('w-1', { version: '1.1.0', packageUrl: 'url' }, 'other-dev'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('incrementDownload', () => {
    it('increments download count', async () => {
      widgetRepo.findOne.mockResolvedValue(mockWidget);
      widgetRepo.increment.mockResolvedValue(undefined);

      const result = await service.incrementDownload('w-1');
      expect(result.downloads).toBe(101);
      expect(widgetRepo.increment).toHaveBeenCalledWith({ id: 'w-1' }, 'downloads', 1);
    });
  });

  describe('createReview', () => {
    it('creates a review and updates rating', async () => {
      widgetRepo.findOne.mockResolvedValue(mockWidget);
      reviewRepo.create.mockReturnValue({ widgetId: 'w-1', rating: 5, comment: 'Great!' });
      reviewRepo.save.mockResolvedValue({ id: 'r-1', rating: 5 });
      reviewRepo.find.mockResolvedValue([
        { rating: 5 },
        { rating: 4 },
        { rating: 3 },
      ]);
      widgetRepo.update.mockResolvedValue(undefined);

      const result = await service.createReview('w-1', {
        rating: 5,
        comment: 'Great!',
        userName: 'User',
      });

      expect(reviewRepo.save).toHaveBeenCalled();
      expect(widgetRepo.update).toHaveBeenCalledWith('w-1', {
        rating: 4,
        ratingCount: 3,
      });
    });
  });

  describe('updateStatus', () => {
    it('updates widget status', async () => {
      widgetRepo.findOne.mockResolvedValue(mockWidget);
      widgetRepo.save.mockResolvedValue({ ...mockWidget, status: WidgetStatus.APPROVED });

      const result = await service.updateStatus('w-1', WidgetStatus.APPROVED);
      expect(widgetRepo.save).toHaveBeenCalled();
    });

    it('throws NotFoundException for unknown widget', async () => {
      widgetRepo.findOne.mockResolvedValue(null);

      await expect(
        service.updateStatus('unknown', WidgetStatus.APPROVED),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
