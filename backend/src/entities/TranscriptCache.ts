import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm'

/**
 * Cached Whisper transcription. Keyed by SHA-256 of the audio URL so we can
 * dedup transcriptions across episodes that resolve to the same MP3.
 *
 * Payload is the full transcript JSON (provider + text + words + segments +
 * durationSeconds) so the API response can come straight off the cache.
 */
@Entity('transcript_cache')
export class TranscriptCache {
  @PrimaryGeneratedColumn('increment')
  id: number

  @Index({ unique: true })
  @Column({ type: 'text' })
  audioUrlHash: string

  @Column({ type: 'text' })
  audioUrl: string

  @Column({ type: 'text' })
  provider: string

  @Column({ type: 'jsonb' })
  payload: object  // see TranscriptionPayload in transcriptionService.ts

  @Column({ type: 'real', nullable: true })
  durationSeconds: number | null

  @CreateDateColumn()
  createdAt: Date
}
