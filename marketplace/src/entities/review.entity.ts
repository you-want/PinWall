import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Widget } from './widget.entity';

@Entity('reviews')
export class Review {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  widgetId: string;

  @ManyToOne(() => Widget, (widget) => widget.reviews, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'widgetId' })
  widget: Widget;

  @Column({ nullable: true })
  userId: string;

  @Column({ nullable: true })
  userName: string;

  @Column('int')
  rating: number;

  @Column('text', { nullable: true })
  comment: string;

  @CreateDateColumn()
  createdAt: Date;
}
