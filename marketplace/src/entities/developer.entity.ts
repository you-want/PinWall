import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('developers')
export class Developer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column()
  name: string;

  @Column()
  passwordHash: string;

  @Column({ unique: true })
  apiKey: string;

  @Column({ default: false })
  isVerified: boolean;

  @Column({ nullable: true })
  website: string;

  @Column({ nullable: true })
  bio: string;

  @CreateDateColumn()
  createdAt: Date;
}
