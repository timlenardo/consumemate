import { MigrationInterface, QueryRunner, Table } from 'typeorm'

export class AddTranscriptCache1705900000004 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'transcript_cache',
        columns: [
          { name: 'id', type: 'serial', isPrimary: true },
          { name: 'audio_url_hash', type: 'text', isUnique: true },
          { name: 'audio_url', type: 'text' },
          { name: 'provider', type: 'text' },
          { name: 'payload', type: 'jsonb' },
          { name: 'duration_seconds', type: 'real', isNullable: true },
          { name: 'created_at', type: 'timestamp', default: 'now()' },
        ],
      }),
      true
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('transcript_cache')
  }
}
