import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm'

export class InitialSchema1705900000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create accounts table
    await queryRunner.createTable(
      new Table({
        name: 'accounts',
        columns: [
          {
            name: 'id',
            type: 'int',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'increment',
          },
          {
            name: 'phone_number',
            type: 'text',
            isUnique: true,
          },
          {
            name: 'name',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'preferred_voice_id',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'now()',
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'now()',
          },
          {
            name: 'deleted_at',
            type: 'timestamp',
            isNullable: true,
          },
        ],
      }),
      true
    )

    // Create verification_codes table
    await queryRunner.createTable(
      new Table({
        name: 'verification_codes',
        columns: [
          {
            name: 'id',
            type: 'int',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'increment',
          },
          {
            name: 'phone_number',
            type: 'text',
          },
          {
            name: 'code',
            type: 'text',
          },
          {
            name: 'expires_at',
            type: 'timestamp',
          },
          {
            name: 'used_at',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'now()',
          },
        ],
      }),
      true
    )

    await queryRunner.createIndex(
      'verification_codes',
      new TableIndex({
        name: 'idx_verification_codes_phone_number',
        columnNames: ['phone_number'],
      })
    )

    // Create articles table
    await queryRunner.createTable(
      new Table({
        name: 'articles',
        columns: [
          {
            name: 'id',
            type: 'int',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'increment',
          },
          {
            name: 'account_id',
            type: 'int',
          },
          {
            name: 'url',
            type: 'text',
          },
          {
            name: 'title',
            type: 'text',
          },
          {
            name: 'author',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'site_name',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'excerpt',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'content_markdown',
            type: 'text',
          },
          {
            name: 'content_html',
            type: 'text',
          },
          {
            name: 'featured_image',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'word_count',
            type: 'int',
            isNullable: true,
          },
          {
            name: 'estimated_reading_time',
            type: 'int',
            isNullable: true,
          },
          {
            name: 'is_read',
            type: 'boolean',
            default: false,
          },
          {
            name: 'read_at',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'public_slug',
            type: 'text',
            isUnique: true,
          },
          {
            name: 'audio_url',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'audio_voice_id',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'now()',
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'now()',
          },
          {
            name: 'deleted_at',
            type: 'timestamp',
            isNullable: true,
          },
        ],
        foreignKeys: [
          {
            columnNames: ['account_id'],
            referencedTableName: 'accounts',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          },
        ],
      }),
      true
    )

    await queryRunner.createIndex(
      'articles',
      new TableIndex({
        name: 'idx_articles_account_id',
        columnNames: ['account_id'],
      })
    )

    await queryRunner.createIndex(
      'articles',
      new TableIndex({
        name: 'idx_articles_account_url',
        columnNames: ['account_id', 'url'],
      })
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('articles')
    await queryRunner.dropTable('verification_codes')
    await queryRunner.dropTable('accounts')
  }
}
