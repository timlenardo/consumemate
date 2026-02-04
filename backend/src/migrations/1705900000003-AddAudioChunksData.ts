import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm'

export class AddAudioChunksData1705900000003 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'articles',
      new TableColumn({
        name: 'audio_chunks_data',
        type: 'text',
        isNullable: true,
      })
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('articles', 'audio_chunks_data')
  }
}
