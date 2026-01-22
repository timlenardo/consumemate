import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm'

export class AddAudioTimings1705900000002 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'articles',
      new TableColumn({
        name: 'audio_word_timings',
        type: 'text',
        isNullable: true,
      })
    )

    await queryRunner.addColumn(
      'articles',
      new TableColumn({
        name: 'audio_processed_text',
        type: 'text',
        isNullable: true,
      })
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('articles', 'audio_word_timings')
    await queryRunner.dropColumn('articles', 'audio_processed_text')
  }
}
