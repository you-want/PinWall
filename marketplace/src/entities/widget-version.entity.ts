import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Widget } from './widget.entity';

@Entity('widget_versions')
export class WidgetVersion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  widgetId: string;

  @ManyToOne(() => Widget, (widget) => widget.versions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'widgetId' })
  widget: Widget;

  @Column()
  version: string;

  @Column({ nullable: true })
  packageUrl: string;

  @Column('jsonb', { nullable: true })
  manifest: Record<string, any>;

  @Column('text', { nullable: true })
  changelog: string;

  @Column({ default: 0 })
  downloadCount: number;

  @Column('bigint', { nullable: true })
  packageSize: number;

  @CreateDateColumn()
  createdAt: Date;
}
