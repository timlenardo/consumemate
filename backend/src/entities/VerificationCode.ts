import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm'

@Entity('verification_codes')
export class VerificationCode {
  @PrimaryGeneratedColumn('increment')
  id: number

  @Column({ type: 'text' })
  phoneNumber: string

  @Column({ type: 'text' })
  code: string

  @Column({ type: 'timestamp' })
  expiresAt: Date

  @Column({ type: 'timestamp', nullable: true })
  usedAt: Date | null

  @CreateDateColumn()
  createdAt: Date
}
