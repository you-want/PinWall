import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { WidgetVersion } from './widget-version.entity';
import { Review } from './review.entity';

export enum WidgetType {
  OFFICIAL = 'official',
  COMMUNITY = 'community',
}

export enum WidgetCategory {
  UTILITY = 'utility',
  PRODUCTIVITY = 'productivity',
  BEAUTIFICATION = 'beautification',
  ENTERTAINMENT = 'entertainment',
  SYSTEM = 'system',
}

export enum WidgetStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  ARCHIVED = 'archived',
}

@Entity('widgets')
export class Widget {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  @Index()
  slug: string;

  @Column()
  name: string;

  @Column('text')
  description: string;

  @Column({ nullable: true })
  author: string;

  @Column({
    type: 'enum',
    enum: WidgetCategory,
    default: WidgetCategory.UTILITY,
  })
  @Index()
  category: WidgetCategory;

  @Column({ nullable: true })
  iconUrl: string;

  @Column({
    type: 'enum',
    enum: WidgetType,
    default: WidgetType.COMMUNITY,
  })
  @Index()
  widgetType: WidgetType;

  @Column({
    type: 'enum',
    enum: WidgetStatus,
    default: WidgetStatus.PENDING,
  })
  @Index()
  status: WidgetStatus;

  @Column({ default: 0 })
  downloads: number;

  @Column('decimal', { precision: 3, scale: 2, default: 0 })
  rating: number;

  @Column({ default: 0 })
  ratingCount: number;

  @Column('jsonb', { nullable: true })
  manifest: Record<string, any>;

  @Column('simple-array', { nullable: true })
  screenshots: string[];

  @Column({ nullable: true })
  homepageUrl: string;

  @Column({ nullable: true })
  repositoryUrl: string;

  @Column({ nullable: true })
  developerId: string;

  @OneToMany(() => WidgetVersion, (version) => version.widget, { cascade: true })
  versions: WidgetVersion[];

  @OneToMany(() => Review, (review) => review.widget)
  reviews: Review[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
