import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm'
import { Account } from './Account'

@Entity('articles')
export class Article {
  @PrimaryGeneratedColumn('increment')
  id: number

  @Column({ type: 'int' })
  accountId: number

  @Column({ type: 'text' })
  url: string

  @Column({ type: 'text' })
  title: string

  @Column({ type: 'text', nullable: true })
  author: string | null

  @Column({ type: 'text', nullable: true })
  siteName: string | null

  @Column({ type: 'text', nullable: true })
  excerpt: string | null

  @Column({ type: 'text' })
  contentMarkdown: string

  @Column({ type: 'text' })
  contentHtml: string

  @Column({ type: 'text', nullable: true })
  featuredImage: string | null

  @Column({ type: 'int', nullable: true })
  wordCount: number | null

  @Column({ type: 'int', nullable: true })
  estimatedReadingTime: number | null

  @Column({ type: 'boolean', default: false })
  isRead: boolean

  @Column({ type: 'timestamp', nullable: true })
  readAt: Date | null

  @Column({ type: 'text', unique: true })
  publicSlug: string

  @Column({ type: 'text', nullable: true })
  audioUrl: string | null

  @Column({ type: 'text', nullable: true })
  audioVoiceId: string | null

  @Column({ type: 'text', nullable: true })
  audioData: string | null

  @Column({ type: 'text', nullable: true })
  audioWordTimings: string | null  // JSON string of WordTiming[]

  @Column({ type: 'text', nullable: true })
  audioProcessedText: string | null  // The text that was actually converted to audio

  @Column({ type: 'text', nullable: true })
  audioChunksData: string | null  // JSON: { voiceId: string, chunks: { [index: number]: { audioData: string, wordTimings: WordTiming[] } } }

  @CreateDateColumn()
  createdAt: Date

  @UpdateDateColumn()
  updatedAt: Date

  @DeleteDateColumn()
  deletedAt: Date | null

  @ManyToOne(() => Account, (account) => account.articles)
  @JoinColumn({ name: 'account_id' })
  account: Account
}
