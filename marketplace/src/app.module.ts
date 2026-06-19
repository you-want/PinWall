import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { Widget, WidgetVersion, Review, Developer } from './entities';
import { AuthModule } from './modules/auth/auth.module';
import { WidgetsModule } from './modules/widgets/widgets.module';
import configuration from './config/configuration';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST ?? 'localhost',
      port: parseInt(process.env.DB_PORT ?? '5432', 10),
      username: process.env.DB_USERNAME ?? 'pinwall',
      password: process.env.DB_PASSWORD ?? 'pinwall',
      database: process.env.DB_NAME ?? 'pinwall_marketplace',
      entities: [Widget, WidgetVersion, Review, Developer],
      synchronize: process.env.NODE_ENV !== 'production',
      logging: process.env.NODE_ENV === 'development',
    }),
    AuthModule,
    WidgetsModule,
  ],
})
export class AppModule {}
