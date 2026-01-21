import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  OneToMany,
} from 'typeorm'
import { Article } from './Article'

@Entity('accounts')
export class Account {
  @PrimaryGeneratedColumn('increment')
  id: number

  @Column({ type: 'text', unique: true })
  phoneNumber: string

  @Column({ type: 'text', nullable: true })
  name: string | null

  @Column({ type: 'text', nullable: true })
  preferredVoiceId: string | null

  @CreateDateColumn()
  createdAt: Date

  @UpdateDateColumn()
  updatedAt: Date

  @DeleteDateColumn()
  deletedAt: Date | null

  @OneToMany(() => Article, (article) => article.account)
  articles: Article[]
}
