// Every constraint owns the same four experimental cases. Negative cases carry
// an exact normalized finding; all other cases assert an empty finding set.
function code(strings, ...values) {
    const value = String.raw({ raw: strings }, ...values).replace(/^\n/, '').replace(/\n\s*$/, '');
    const lines = value.split('\n');
    const indents = lines.filter((line) => line.trim()).map((line) => line.match(/^\s*/)[0].length);
    const indent = indents.length > 0 ? Math.min(...indents) : 0;
    return lines.map((line) => line.slice(indent)).join('\n') + '\n';
}

const empty = () => ({ expected: [] });
const scenario = (files, expected = []) => ({ files, expected });

export const backendConstraintFixtures = [
    {
        ruleId: 'BE-STRUCT-C-001',
        findingRuleId: 'BE-STRUCT-C-001-module-composition',
        adapter: 'backend-static',
        cases: {
            positive: scenario({
                'src/modules/users/users.controller.ts': code`export class UsersController {}`,
                'src/modules/users/users.service.ts': code`export class UsersService {}`,
                'src/modules/users/users.repository.ts': code`export class UsersRepository {}`,
                'src/modules/users/users.module.ts': code`
                    import { Module } from '@nestjs/common';
                    import { UsersController } from './users.controller';
                    import { UsersService } from './users.service';
                    import { UsersRepository } from './users.repository';
                    @Module({ controllers: [UsersController], providers: [UsersService, UsersRepository] })
                    export class UsersModule {}
                `,
            }),
            negative: scenario({
                'src/modules/users/users.controller.ts': code`export class UsersController {}`,
                'src/modules/users/users.service.ts': code`export class UsersService {}`,
                'src/modules/users/users.repository.ts': code`export class UsersRepository {}`,
                'src/modules/users/users.module.ts': code`
                    import { Module } from '@nestjs/common';
                    import { UsersController } from './users.controller';
                    import { UsersService } from './users.service';
                    @Module({ controllers: [UsersController], providers: [UsersService] })
                    export class UsersModule {}
                `,
            }),
            nearMiss: scenario({
                'src/app.module.ts': code`
                    import { Module } from '@nestjs/common';
                    @Module({})
                    export class AppModule {}
                `,
            }),
            ignored: scenario({
                'src/modules/users/users.module.spec.ts': code`
                    import { Module } from '@nestjs/common';
                    @Module({})
                    export class UsersModule {}
                `,
            }),
        },
    },
    {
        ruleId: 'BE-DEP-C-001',
        findingRuleId: 'BE-DEP-C-001-intra-module-layering',
        adapter: 'backend-static',
        cases: {
            positive: scenario({
                'src/modules/users/users.controller.ts': code`import { UsersService } from './users.service'; export class UsersController { constructor(private readonly users: UsersService) {} }`,
                'src/modules/users/users.service.ts': code`export class UsersService {}`,
            }),
            negative: scenario({
                'src/modules/users/users.controller.ts': code`import { UsersRepository } from './users.repository'; export class UsersController { constructor(private readonly users: UsersRepository) {} }`,
                'src/modules/users/users.repository.ts': code`export class UsersRepository {}`,
            }),
            nearMiss: scenario({
                'src/modules/users/users.controller.ts': code`import { CreateUserDto } from './dto/create-user.dto'; export class UsersController { create(input: CreateUserDto) { return input; } }`,
                'src/modules/users/dto/create-user.dto.ts': code`export class CreateUserDto { name!: string; }`,
            }),
            ignored: scenario({
                'src/modules/users/users.controller.spec.ts': code`import { UsersRepository } from './users.repository'; export const repository = new UsersRepository();`,
                'src/modules/users/users.repository.ts': code`export class UsersRepository {}`,
            }),
        },
    },
    {
        ruleId: 'BE-DEP-C-002',
        findingRuleId: 'BE-DEP-C-002-infrastructure-isolation',
        adapter: 'backend-static',
        cases: {
            positive: scenario({
                'src/common/clock.ts': code`import { formatDate } from './format-date'; export const now = () => formatDate(new Date());`,
                'src/common/format-date.ts': code`export const formatDate = (date: Date) => date.toISOString();`,
            }),
            negative: scenario({
                'tsconfig.json': code`{"compilerOptions":{"baseUrl":".","paths":{"@modules/*":["src/modules/*"]}}}`,
                'src/core/seed.ts': code`export async function seed() { return import('@modules/users'); }`,
                'src/modules/users/index.ts': code`export { UserEntity } from './user.entity';`,
                'src/modules/users/user.entity.ts': code`export class UserEntity {}`,
            }),
            nearMiss: scenario({
                'src/modules/users/users.service.ts': code`import { Clock } from '../../core/clock'; export class UsersService { constructor(private readonly clock: Clock) {} }`,
                'src/core/clock.ts': code`export class Clock {}`,
            }),
            ignored: scenario({
                'src/core/seed.spec.ts': code`import { UserEntity } from '../modules/users/user.entity'; export const sample = new UserEntity();`,
                'src/modules/users/user.entity.ts': code`export class UserEntity {}`,
            }),
        },
    },
    {
        ruleId: 'BE-DEP-C-003',
        findingRuleId: 'BE-DEP-C-003-framework-layer-purity',
        adapter: 'backend-static',
        cases: {
            positive: scenario({
                'src/common/guards/auth.guard.ts': code`import { RequestContext } from '../request-context'; export class AuthGuard { canActivate(context: RequestContext) { return Boolean(context.userId); } }`,
                'src/common/request-context.ts': code`export interface RequestContext { userId?: string; }`,
            }),
            negative: scenario({
                'src/common/filters/user.filter.ts': code`import { UserRepository } from '../../modules/users/user.repository'; export class UserFilter { constructor(readonly users: UserRepository) {} }`,
                'src/modules/users/user.repository.ts': code`export class UserRepository {}`,
            }),
            nearMiss: scenario({
                'src/common/interceptors/user.interceptor.ts': code`import type { UserSummaryDto } from '../../modules/users/dto/user-summary.dto'; export type Summary = UserSummaryDto;`,
                'src/modules/users/dto/user-summary.dto.ts': code`export interface UserSummaryDto { id: string; }`,
            }),
            ignored: scenario({
                'src/common/guards/auth.guard.spec.ts': code`import { UserEntity } from '../../modules/users/user.entity'; export const user = new UserEntity();`,
                'src/modules/users/user.entity.ts': code`export class UserEntity {}`,
            }),
        },
    },
    {
        ruleId: 'BE-DEP-C-004',
        findingRuleId: 'BE-DEP-C-004-no-circular-dependencies',
        adapter: 'dep-cruiser',
        cases: {
            positive: scenario({
                'src/a.ts': code`import { b } from './b'; export const a = b + 1;`,
                'src/b.ts': code`export const b = 1;`,
            }),
            negative: scenario({
                'src/a.ts': code`import { b } from './b'; export const a = b + 1;`,
                'src/b.ts': code`import { a } from './a'; export const b = a + 1;`,
            }),
            nearMiss: scenario({
                'src/a.ts': code`import type { B } from './b'; export interface A { b: B; }`,
                'src/b.ts': code`import type { A } from './a'; export interface B { a: A; }`,
            }),
            ignored: scenario({
                'src/a.spec.ts': code`import { b } from './b.spec'; export const a = b + 1;`,
                'src/b.spec.ts': code`import { a } from './a.spec'; export const b = a + 1;`,
            }),
        },
    },
    {
        ruleId: 'BE-DOM-C-001',
        findingRuleId: 'BE-DOM-C-001-no-cross-module-deep-import',
        adapter: 'backend-static',
        cases: {
            positive: scenario({
                'src/modules/orders/orders.service.ts': code`import { UsersModule } from '../users'; export const dependency = UsersModule;`,
                'src/modules/users/index.ts': code`export { UsersModule } from './users.module';`,
                'src/modules/users/users.module.ts': code`export class UsersModule {}`,
            }),
            negative: scenario({
                'src/modules/orders/orders.service.ts': code`import { UsersService } from '../users/users.service'; export class OrdersService { constructor(readonly users: UsersService) {} }`,
                'src/modules/users/users.service.ts': code`export class UsersService {}`,
            }),
            nearMiss: scenario({
                'src/modules/orders/orders.controller.ts': code`import { OrdersService } from './orders.service'; export class OrdersController { constructor(readonly orders: OrdersService) {} }`,
                'src/modules/orders/orders.service.ts': code`export class OrdersService {}`,
            }),
            ignored: scenario({
                'src/modules/orders/orders.service.spec.ts': code`import { UsersService } from '../users/users.service'; export const users = new UsersService();`,
                'src/modules/users/users.service.ts': code`export class UsersService {}`,
            }),
        },
    },
    {
        ruleId: 'BE-DOM-C-002',
        findingRuleId: 'BE-DOM-C-002-no-repository-in-module-exports',
        adapter: 'backend-static',
        cases: {
            positive: scenario({
                'src/modules/users/index.ts': code`export { UsersService } from './users.service';`,
                'src/modules/users/users.service.ts': code`export class UsersService {}`,
            }),
            negative: scenario({
                'src/modules/users/index.ts': code`import { UsersRepository as UserStore } from './internal'; export default UserStore;`,
                'src/modules/users/internal/index.ts': code`export { UsersRepository } from '../users.repository';`,
                'src/modules/users/users.repository.ts': code`export class UsersRepository {}`,
            }),
            nearMiss: scenario({
                'src/modules/users/users.module.ts': code`import { UsersRepository } from './users.repository'; const providers = [UsersRepository]; export class UsersModule { static providers = providers; }`,
                'src/modules/users/users.repository.ts': code`export class UsersRepository {}`,
            }),
            ignored: scenario({
                'src/modules/users/index.spec.ts': code`export { UsersRepository } from './users.repository';`,
                'src/modules/users/users.repository.ts': code`export class UsersRepository {}`,
            }),
        },
    },
    {
        ruleId: 'BE-ERR-C-001',
        findingRuleId: 'BE-ERR-C-001-no-http-exception-in-service',
        adapter: 'backend-static',
        cases: {
            positive: scenario({
                'src/modules/users/users.service.ts': code`import { AppException } from '../../common/errors/app-exception'; export class UsersService { find() { throw new AppException('missing'); } }`,
                'src/common/errors/app-exception.ts': code`export class AppException extends Error {}`,
            }),
            negative: scenario({
                'src/modules/users/users.service.ts': code`import { DomainHttpError as Failure } from './domain-http-error'; export class UsersService { create() { throw new Failure('bad'); } }`,
                'src/modules/users/domain-http-error.ts': code`import { BadRequestException as BadInput } from '@nestjs/common'; export class DomainHttpError extends BadInput {}`,
            }),
            nearMiss: scenario({
                'src/modules/users/users.service.ts': code`class BadRequestException extends Error {} export class UsersService { create() { throw new BadRequestException('domain'); } }`,
            }),
            ignored: scenario({
                'src/modules/users/users.service.spec.ts': code`import { BadRequestException } from '@nestjs/common'; export const fail = () => { throw new BadRequestException(); };`,
            }),
        },
    },
    {
        ruleId: 'BE-ERR-C-002',
        findingRuleId: 'BE-ERR-C-002-throw-only-app-exception',
        adapter: 'backend-static',
        cases: {
            positive: scenario({
                'src/modules/users/users.service.ts': code`import { AppException as DomainFailure } from '../../common/errors/app-exception'; function missing() { return new DomainFailure('missing'); } export class UsersService { find() { throw missing(); } }`,
                'src/common/errors/app-exception.ts': code`export class AppException extends Error {}`,
            }),
            negative: scenario({
                'src/modules/users/users.service.ts': code`class AppException extends Error {} export class UsersService { find() { throw new AppException('fake'); } }`,
            }),
            nearMiss: scenario({
                'src/modules/users/users.service.ts': code`export class UsersService { find() { try { return 1; } catch (error) { throw error; } } }`,
            }),
            ignored: scenario({
                'src/modules/users/users.service.generated.ts': code`export class UsersService { find() { throw new Error('generated'); } }`,
            }),
        },
    },
    {
        ruleId: 'BE-ERR-C-003',
        findingRuleId: 'BE-ERR-C-003-no-silent-catch',
        adapter: 'backend-static',
        cases: {
            positive: scenario({
                'src/modules/users/users.service.ts': code`export class UsersService { find() { try { return 1; } catch { return 0; } } }`,
            }),
            negative: scenario({
                'src/modules/users/users.service.ts': code`export class UsersService { find() { try { return 1; } catch (error) { console.error(error); } } }`,
            }),
            nearMiss: scenario({
                'src/modules/users/users.service.ts': code`declare function recover(error: unknown): void; export class UsersService { find() { try { return 1; } catch (error) { recover(error); return 0; } } }`,
            }),
            ignored: scenario({
                'src/modules/users/users.service.spec.ts': code`export function run() { try { return 1; } catch (error) { console.error(error); } }`,
            }),
        },
    },
    {
        ruleId: 'BE-CONTRACT-C-001',
        findingRuleId: 'BE-CONTRACT-C-001-entity-change-requires-migration',
        adapter: 'contract-diff',
        cases: {
            positive: {
                before: { 'src/modules/users/user.entity.ts': code`import { Entity, Column } from 'typeorm'; @Entity('users') export class UserEntity { @Column() name!: string; }` },
                files: {
                    'src/modules/users/user.entity.ts': code`import { Entity, Column } from 'typeorm'; @Entity('users') export class UserEntity { @Column() name!: string; @Column() displayName!: string; }`,
                    'src/core/database/migrations/001-user-name.ts': code`export class UserName { async up(queryRunner: any) { await queryRunner.query('ALTER TABLE users ADD COLUMN displayName varchar'); } async down(queryRunner: any) { await queryRunner.query('ALTER TABLE users DROP COLUMN displayName'); } }`,
                },
                expected: [],
            },
            negative: {
                before: { 'src/modules/users/user.entity.ts': code`import { Entity, Column } from 'typeorm'; @Entity('users') export class UserEntity { @Column() name!: string; }` },
                files: {
                    'src/modules/users/user.entity.ts': code`import { Entity, Column } from 'typeorm'; @Entity('users') export class UserEntity { @Column() name!: string; @Column() displayName!: string; }`,
                    'src/core/database/migrations/001-other.ts': code`export class Other { async up(queryRunner: any) { await queryRunner.query('ALTER TABLE teams ADD COLUMN slug varchar'); } async down(queryRunner: any) { await queryRunner.query('ALTER TABLE teams DROP COLUMN slug'); } }`,
                },
            },
            nearMiss: {
                before: { 'src/modules/users/user.entity.ts': code`import { Entity, Column } from 'typeorm'; @Entity('users') export class UserEntity { @Column() name!: string; transient?: string; }` },
                files: { 'src/modules/users/user.entity.ts': code`import { Entity, Column } from 'typeorm'; @Entity('users') export class UserEntity { @Column() name!: string; transient?: number; }` },
                expected: [],
            },
            ignored: {
                before: { 'src/modules/users/user.entity.spec.ts': code`export class UserEntity {}` },
                files: { 'src/modules/users/user.entity.spec.ts': code`import { Column } from 'typeorm'; export class UserEntity { @Column() name!: string; }` },
                expected: [],
            },
        },
    },
    {
        ruleId: 'BE-CONTRACT-C-002',
        findingRuleId: 'BE-CONTRACT-C-002-request-dto-uses-class-validator',
        adapter: 'backend-static',
        cases: {
            positive: scenario({
                'src/modules/users/users.controller.ts': code`import { Body } from '@nestjs/common'; import { CreateUserDto } from './create-user.dto'; export class UsersController { create(@Body() input: CreateUserDto) { return input; } }`,
                'src/modules/users/create-user.dto.ts': code`import { IsString } from 'class-validator'; export class CreateUserDto { @IsString() name!: string; }`,
            }),
            negative: scenario({
                'src/modules/users/users.controller.ts': code`import { Body } from '@nestjs/common'; import { CreateUserDto } from './create-user.dto'; export class UsersController { create(@Body() input: CreateUserDto) { return input; } }`,
                'src/modules/users/create-user.dto.ts': code`export class CreateUserDto { name!: string; }`,
            }),
            nearMiss: scenario({
                'src/modules/users/users.controller.ts': code`import { UserResponseDto } from './user-response.dto'; export class UsersController { find(): UserResponseDto { return { name: 'Ada' }; } }`,
                'src/modules/users/user-response.dto.ts': code`export class UserResponseDto { name!: string; }`,
            }),
            ignored: scenario({
                'src/modules/users/users.controller.spec.ts': code`import { Body } from '@nestjs/common'; class CreateUserDto { name!: string; } export class UsersController { create(@Body() input: CreateUserDto) { return input; } }`,
            }),
        },
    },
    {
        ruleId: 'BE-CONTRACT-C-003',
        findingRuleId: 'BE-CONTRACT-C-003-optional-request-properties-validate-values',
        adapter: 'backend-static',
        cases: {
            positive: scenario({
                'src/modules/users/users.controller.ts': code`import { Body } from '@nestjs/common'; import { UpdateUserDto } from './update-user.dto'; export class UsersController { update(@Body() input: UpdateUserDto) { return input; } }`,
                'src/modules/users/update-user.dto.ts': code`import { IsOptional, IsString } from 'class-validator'; export class UpdateUserDto { @IsOptional() @IsString() name?: string; }`,
            }),
            negative: scenario({
                'src/modules/users/users.controller.ts': code`import { Body } from '@nestjs/common'; import { UpdateUserDto } from './update-user.dto'; export class UsersController { update(@Body() input: UpdateUserDto) { return input; } }`,
                'src/modules/users/update-user.dto.ts': code`import { IsOptional } from 'class-validator'; export class UpdateUserDto { @IsOptional() name?: string; }`,
            }),
            nearMiss: scenario({
                'src/modules/users/users.controller.ts': code`import { Body } from '@nestjs/common'; import { UpdateUserDto } from './update-user.dto'; export class UsersController { update(@Body() input: UpdateUserDto) { return input; } }`,
                'src/modules/users/update-user.dto.ts': code`import { PartialType } from '@nestjs/mapped-types'; import { IsString } from 'class-validator'; class CreateUserDto { @IsString() name!: string; } export class UpdateUserDto extends PartialType(CreateUserDto) {}`,
            }),
            ignored: scenario({
                'src/modules/users/update-user.dto.spec.ts': code`import { IsOptional } from 'class-validator'; export class UpdateUserDto { @IsOptional() name?: string; }`,
            }),
        },
    },
    {
        ruleId: 'BE-CONTRACT-C-004',
        findingRuleId: 'BE-CONTRACT-C-004-validation-pipe-whitelisting',
        adapter: 'backend-static',
        cases: {
            positive: scenario({
                'src/main.ts': code`import { ValidationPipe } from '@nestjs/common'; const options = { whitelist: true, forbidNonWhitelisted: true, transform: true }; app.useGlobalPipes(new ValidationPipe(options));`,
            }),
            negative: scenario({
                'src/main.ts': code`import { ValidationPipe } from '@nestjs/common'; app.useGlobalPipes(new ValidationPipe({ whitelist: true }));`,
            }),
            nearMiss: scenario({
                'src/app.module.ts': code`import { APP_PIPE } from '@nestjs/core'; import { ValidationPipe } from '@nestjs/common'; const options = () => ({ whitelist: true, forbidNonWhitelisted: true }); export const providers = [{ provide: APP_PIPE, useFactory: () => new ValidationPipe(options()) }];`,
            }),
            ignored: scenario({
                'src/main.spec.ts': code`import { ValidationPipe } from '@nestjs/common'; app.useGlobalPipes(new ValidationPipe({ whitelist: false }));`,
            }),
        },
    },
    {
        ruleId: 'BE-TEST-C-001',
        findingRuleId: 'BE-TEST-C-001-no-direct-repository-construction',
        adapter: 'backend-static',
        cases: {
            positive: scenario({
                'src/modules/users/users.service.ts': code`import { UsersRepository } from './users.repository'; export class UsersService { constructor(private readonly users: UsersRepository) {} }`,
                'src/modules/users/users.repository.ts': code`export class UsersRepository {}`,
            }),
            negative: scenario({
                'src/modules/users/users.service.ts': code`import { Repository as Repo } from 'typeorm'; export class UsersService { create() { return new Repo(); } }`,
            }),
            nearMiss: scenario({
                'src/modules/users/users.service.ts': code`class RepositoryQuery { run() { return 1; } } export class UsersService { query() { return new RepositoryQuery(); } }`,
            }),
            ignored: scenario({
                'src/modules/users/users.service.spec.ts': code`import { Repository } from 'typeorm'; export const repository = new Repository();`,
            }),
        },
    },
    {
        ruleId: 'BE-ROUTE-C-001',
        findingRuleId: 'BE-ROUTE-C-001-api-prefix-and-kebab-case',
        adapter: 'backend-static',
        cases: {
            positive: scenario({
                'src/main.ts': code`const API_PREFIX = 'api'; app.setGlobalPrefix(API_PREFIX);`,
                'src/modules/users/users.controller.ts': code`import { Controller, Get } from '@nestjs/common'; @Controller('user-profiles') export class UsersController { @Get(':userId') find() {} }`,
            }),
            negative: scenario({
                'src/main.ts': code`app.setGlobalPrefix('api');`,
                'src/modules/users/users.controller.ts': code`import { Controller } from '@nestjs/common'; @Controller('userProfiles') export class UsersController {}`,
            }),
            nearMiss: scenario({
                'src/main.ts': code`app.setGlobalPrefix('/api');`,
                'src/modules/users/users.controller.ts': code`import { Controller, Get } from '@nestjs/common'; const paths = ['v1/user-profiles', 'v2/user-profiles']; @Controller(paths) export class UsersController { @Get('{*splat}') find() {} }`,
            }),
            ignored: scenario({
                'src/main.ts': code`app.setGlobalPrefix('api');`,
                'src/modules/users/users.controller.spec.ts': code`import { Controller } from '@nestjs/common'; @Controller('userProfiles') export class UsersController {}`,
            }),
        },
    },
    {
        ruleId: 'BE-SIZE-C-001',
        findingRuleId: 'BE-SIZE-C-001-max-method-parameters',
        adapter: 'backend-static',
        cases: {
            positive: scenario({ 'src/modules/users/users.service.ts': code`export class UsersService { find(a: string, b: string, c: string) { return [a, b, c]; } }` }),
            negative: scenario({ 'src/modules/users/users.service.ts': code`export class UsersService { find(a: string, b: string, c: string, d: string) { return [a, b, c, d]; } }` }),
            nearMiss: scenario({ 'src/modules/users/users.service.ts': code`export class UsersService { constructor(a: string, b: string, c: string, d: string) {} }` }),
            ignored: scenario({ 'src/modules/users/users.service.spec.ts': code`export class UsersService { find(a: string, b: string, c: string, d: string) { return 1; } }` }),
        },
    },
    {
        ruleId: 'BE-DUP-C-001',
        findingRuleId: 'BE-DUP-C-001-single-resource-owner',
        adapter: 'backend-static',
        cases: {
            positive: scenario({
                'src/modules/users/users.module.ts': code`export class UsersModule {}`,
                'src/modules/teams/teams.module.ts': code`export class TeamsModule {}`,
            }),
            negative: scenario({
                'src/modules/user/user.module.ts': code`export class UserModule {}`,
                'src/modules/users/users.module.ts': code`export class UsersModule {}`,
            }),
            nearMiss: scenario({
                'src/modules/users/users-v1.controller.ts': code`import { Controller } from '@nestjs/common'; @Controller('v1/users') export class UsersV1Controller {}`,
                'src/modules/users/users-v2.controller.ts': code`import { Controller } from '@nestjs/common'; @Controller('v2/users') export class UsersV2Controller {}`,
            }),
            ignored: scenario({
                'src/modules/users/users.controller.ts': code`import { Controller } from '@nestjs/common'; @Controller('users') export class UsersController {}`,
                'src/modules/users/users.controller.spec.ts': code`import { Controller } from '@nestjs/common'; @Controller('users') export class DuplicateUsersController {}`,
            }),
        },
    },
    {
        ruleId: 'BE-DUP-C-002',
        findingRuleId: 'BE-DUP-C-002-single-policy-implementation',
        adapter: 'backend-static',
        cases: {
            positive: scenario({
                'src/policies/status.policy.ts': code`export const ALLOWED_STATUSES = ['draft', 'published'];`,
                'src/modules/articles/articles.service.ts': code`import { ALLOWED_STATUSES } from '../../policies/status.policy'; export const allowed = ALLOWED_STATUSES;`,
            }),
            negative: scenario({
                'src/modules/articles/article.policy.ts': code`export const ALLOWED_STATUSES = ['draft', 'published'];`,
                'src/modules/admin/admin.policy.ts': code`export const ALLOWED_STATUSES = ['draft', 'published'];`,
            }),
            nearMiss: scenario({
                'src/modules/articles/article.policy.ts': code`export const ALLOWED_STATUSES = ['draft', 'published'];`,
                'src/modules/orders/order.policy.ts': code`export const ALLOWED_ORDER_STATES = ['draft', 'published'];`,
            }),
            ignored: scenario({
                'src/modules/articles/article.policy.ts': code`export const ALLOWED_STATUSES = ['draft', 'published'];`,
                'src/modules/articles/article.policy.spec.ts': code`export const ALLOWED_STATUSES = ['draft', 'published'];`,
            }),
        },
    },
    {
        ruleId: 'BE-DUP-C-003',
        findingRuleId: 'BE-DUP-C-003-no-equivalent-production-code',
        adapter: 'backend-static',
        cases: {
            positive: scenario({
                'src/common/format-name.ts': code`export function formatName(first: string, last: string) { return first.trim() + ' ' + last.trim(); }`,
                'src/modules/users/users.service.ts': code`import { formatName } from '../../common/format-name'; export class UsersService { name(first: string, last: string) { return formatName(first, last); } }`,
            }),
            negative: scenario({
                'src/modules/users/name.ts': code`export function formatName(first: string, last: string) { return first.trim() + ' ' + last.trim(); }`,
                'src/modules/contacts/name.ts': code`export function displayName(first: string, last: string) { return first.trim() + ' ' + last.trim(); }`,
            }),
            nearMiss: scenario({
                'src/modules/users/name.ts': code`export function formatName(first: string, last: string) { return first.trim() + ' ' + last.trim(); }`,
                'src/modules/contacts/name.ts': code`export function displayName(first: string, last: string) { return last.trim() + ', ' + first.trim(); }`,
            }),
            ignored: scenario({
                'src/modules/users/name.ts': code`export function formatName(first: string, last: string) { return first.trim() + ' ' + last.trim(); }`,
                'src/modules/users/name.spec.ts': code`export function displayName(first: string, last: string) { return first.trim() + ' ' + last.trim(); }`,
            }),
        },
    },
    {
        ruleId: 'BE-STRUCT-C-002',
        findingRuleId: 'BE-STRUCT-C-002-no-explicit-any',
        adapter: 'eslint',
        cases: {
            positive: scenario({ 'src/modules/users/value.ts': code`export const value: unknown = 1;` }),
            negative: scenario({ 'src/modules/users/value.ts': code`export const value: any = 1;` }),
            nearMiss: scenario({ 'src/modules/users/value.ts': code`export type JsonMap = Record<string, unknown>;` }),
            ignored: scenario({
                'src/index.ts': code`export const value: unknown = 1;`,
                'src/modules/users/value.spec.ts': code`export const value: any = 1;`,
            }),
        },
    },
];

const negativeExpectations = {
    'BE-STRUCT-C-002': [{
        rule_id: 'BE-STRUCT-C-002-no-explicit-any',
        location: { file: 'src/modules/users/value.ts', line: 1, column: 21 },
        evidence: {
            source_tool: 'eslint',
            source_rule_id: '@typescript-eslint/no-explicit-any',
            payload: {
                message: 'Unexpected any. Specify a different type.',
                severity: 1,
                eslint_rule_id: '@typescript-eslint/no-explicit-any',
                architecture_rule_id: null,
            },
        },
    }],
    'BE-STRUCT-C-001': [{
        rule_id: 'BE-STRUCT-C-001-module-composition',
        location: { file: 'src/modules/users/users.module.ts', line: 4, column: 1 },
        evidence: {
            source_tool: 'backend-static',
            source_rule_id: 'BE-STRUCT-C-001',
            payload: {
                module: 'users',
                missing_files: [],
                missing_registrations: ['repository:src/modules/users/users.repository.ts'],
                message: 'Business module users must provide and register its controller, service, and repository.',
            },
        },
    }],
    'BE-DEP-C-001': [{
        rule_id: 'BE-DEP-C-001-intra-module-layering',
        location: { file: 'src/modules/users/users.controller.ts', line: 1, column: 33 },
        evidence: {
            source_tool: 'backend-static',
            source_rule_id: 'BE-DEP-C-001',
            payload: {
                from_layer: 'controller',
                to_layer: 'repository',
                import_path: './users.repository',
                resolved_target: 'src/modules/users/users.repository.ts',
                message: 'controller must not depend directly on repository.',
            },
        },
    }],
    'BE-DEP-C-002': [{
        rule_id: 'BE-DEP-C-002-infrastructure-isolation',
        location: { file: 'src/core/seed.ts', line: 1, column: 46 },
        evidence: {
            source_tool: 'backend-static',
            source_rule_id: 'BE-DEP-C-002',
            payload: {
                import_path: '@modules/users',
                resolved_target: 'src/modules/users/user.entity.ts',
                dynamic: true,
                message: 'common/core must not import business implementations from src/modules.',
            },
        },
    }],
    'BE-DEP-C-003': [{
        rule_id: 'BE-DEP-C-003-framework-layer-purity',
        location: { file: 'src/common/filters/user.filter.ts', line: 1, column: 32 },
        evidence: {
            source_tool: 'backend-static',
            source_rule_id: 'BE-DEP-C-003',
            payload: {
                import_path: '../../modules/users/user.repository',
                resolved_target: 'src/modules/users/user.repository.ts',
                target_layer: 'repository',
                message: 'Guards, interceptors, and filters must remain independent of module persistence.',
            },
        },
    }],
    'BE-DEP-C-004': [{
        rule_id: 'BE-DEP-C-004-no-circular-dependencies',
        location: { file: 'src/a.ts', line: 1, column: 20 },
        evidence: {
            source_tool: 'dep-cruiser',
            source_rule_id: 'BE-DEP-C-004-no-circular',
            payload: {
                from_module: 'src/a.ts',
                to_module: 'src/b.ts',
                dependency_type: 'local,import',
                severity: 'error',
            },
        },
    }],
    'BE-DOM-C-001': [{
        rule_id: 'BE-DOM-C-001-no-cross-module-deep-import',
        location: { file: 'src/modules/orders/orders.service.ts', line: 1, column: 30 },
        evidence: {
            source_tool: 'backend-static',
            source_rule_id: 'BE-DOM-C-001',
            payload: {
                source_module: 'orders',
                target_module: 'users',
                import_path: '../users/users.service',
                resolved_target: 'src/modules/users/users.service.ts',
                message: 'Cross-module imports must use index.ts or the target module file.',
            },
        },
    }],
    'BE-DOM-C-002': [{
        rule_id: 'BE-DOM-C-002-no-repository-in-module-exports',
        location: { file: 'src/modules/users/index.ts', line: 1, column: 75 },
        evidence: {
            source_tool: 'backend-static',
            source_rule_id: 'BE-DOM-C-002',
            payload: {
                export_kind: 'default-export',
                exported_symbol: 'UserStore',
                resolved_target: 'src/modules/users/users.repository.ts',
                message: 'Module entry points must not export repositories or entities.',
            },
        },
    }],
    'BE-ERR-C-001': [{
        rule_id: 'BE-ERR-C-001-no-http-exception-in-service',
        location: { file: 'src/modules/users/users.service.ts', line: 1, column: 106 },
        evidence: {
            source_tool: 'backend-static',
            source_rule_id: 'BE-ERR-C-001',
            payload: { thrown_type: 'Failure', message: 'Services must not throw NestJS HTTP exceptions.' },
        },
    }],
    'BE-ERR-C-002': [{
        rule_id: 'BE-ERR-C-002-throw-only-app-exception',
        location: { file: 'src/modules/users/users.service.ts', line: 1, column: 74 },
        evidence: {
            source_tool: 'backend-static',
            source_rule_id: 'BE-ERR-C-002',
            payload: { thrown_type: 'AppException', message: 'Service failures must use the project AppException.' },
        },
    }],
    'BE-ERR-C-003': [{
        rule_id: 'BE-ERR-C-003-no-silent-catch',
        location: { file: 'src/modules/users/users.service.ts', line: 1, column: 56 },
        evidence: {
            source_tool: 'backend-static',
            source_rule_id: 'BE-ERR-C-003',
            payload: { behavior: 'log-only', message: 'Catch blocks must handle, wrap, or rethrow errors.' },
        },
    }],
    'BE-CONTRACT-C-001': [{
        rule_id: 'BE-CONTRACT-C-001-entity-change-requires-migration',
        location: { file: 'src/modules/users/user.entity.ts', line: 1, column: 1 },
        evidence: {
            source_tool: 'contract-diff',
            source_rule_id: 'BE-CONTRACT-C-001-entity-change-requires-migration',
            payload: {
                entity_file: 'src/modules/users/user.entity.ts',
                table: 'users',
                property: 'displayName',
                change: 'added',
                migration_files: ['src/core/database/migrations/001-other.ts'],
                message: 'Persistent change users.displayName lacks a matching executable migration.',
            },
        },
    }],
    'BE-CONTRACT-C-002': [{
        rule_id: 'BE-CONTRACT-C-002-request-dto-uses-class-validator',
        location: { file: 'src/modules/users/create-user.dto.ts', line: 1, column: 30 },
        evidence: {
            source_tool: 'backend-static',
            source_rule_id: 'BE-CONTRACT-C-002',
            payload: {
                dto: 'CreateUserDto',
                property: 'name',
                validators: [],
                message: 'Request DTO properties must use class-validator.',
            },
        },
    }],
    'BE-CONTRACT-C-003': [{
        rule_id: 'BE-CONTRACT-C-003-optional-request-properties-validate-values',
        location: { file: 'src/modules/users/update-user.dto.ts', line: 1, column: 90 },
        evidence: {
            source_tool: 'backend-static',
            source_rule_id: 'BE-CONTRACT-C-003',
            payload: {
                dto: 'UpdateUserDto',
                property: 'name',
                validators: ['IsOptional'],
                message: 'Optional request properties must validate supplied values.',
            },
        },
    }],
    'BE-CONTRACT-C-004': [{
        rule_id: 'BE-CONTRACT-C-004-validation-pipe-whitelisting',
        location: { file: 'src/main.ts', line: 1, column: 69 },
        evidence: {
            source_tool: 'backend-static',
            source_rule_id: 'BE-CONTRACT-C-004',
            payload: {
                whitelist: true,
                forbid_non_whitelisted: null,
                message: 'ValidationPipe must enable whitelist and forbidNonWhitelisted.',
            },
        },
    }],
    'BE-TEST-C-001': [{
        rule_id: 'BE-TEST-C-001-no-direct-repository-construction',
        location: { file: 'src/modules/users/users.service.ts', line: 1, column: 93 },
        evidence: {
            source_tool: 'backend-static',
            source_rule_id: 'BE-TEST-C-001',
            payload: {
                constructed_symbol: 'Repo',
                import_source: 'typeorm',
                message: 'Services must obtain repositories through dependency injection.',
            },
        },
    }],
    'BE-ROUTE-C-001': [{
        rule_id: 'BE-ROUTE-C-001-api-prefix-and-kebab-case',
        location: { file: 'src/modules/users/users.controller.ts', line: 1, column: 58 },
        evidence: {
            source_tool: 'backend-static',
            source_rule_id: 'BE-ROUTE-C-001',
            payload: {
                issue: 'controller-path',
                decorator: 'Controller',
                path: 'userProfiles',
                message: 'Route path userProfiles must use kebab-case segments.',
            },
        },
    }],
    'BE-SIZE-C-001': [{
        rule_id: 'BE-SIZE-C-001-max-method-parameters',
        location: { file: 'src/modules/users/users.service.ts', line: 1, column: 29 },
        evidence: {
            source_tool: 'backend-static',
            source_rule_id: 'BE-SIZE-C-001',
            payload: {
                method: 'find',
                parameter_count: 4,
                maximum: 3,
                message: 'Production methods may have at most three direct parameters.',
            },
        },
    }],
    'BE-DUP-C-001': [{
        rule_id: 'BE-DUP-C-001-single-resource-owner',
        location: { file: 'src/modules/users/users.module.ts', line: 1, column: 1 },
        evidence: {
            source_tool: 'backend-static',
            source_rule_id: 'BE-DUP-C-001',
            payload: {
                resource_key: 'user',
                artifact_kind: 'module',
                first_owner: 'user',
                duplicate_owner: 'users',
                first_file: 'src/modules/user/user.module.ts',
                message: 'Business resource user has competing module owners.',
            },
        },
    }],
    'BE-DUP-C-002': [{
        rule_id: 'BE-DUP-C-002-single-policy-implementation',
        location: { file: 'src/modules/articles/article.policy.ts', line: 1, column: 14 },
        evidence: {
            source_tool: 'backend-static',
            source_rule_id: 'BE-DUP-C-002',
            payload: {
                policy_key: 'ALLOWED_STATUSES',
                implementation_kind: 'policy-constant',
                message: 'Policy ALLOWED_STATUSES has more than one authoritative implementation.',
                first_file: 'src/modules/admin/admin.policy.ts',
            },
        },
    }],
    'BE-DUP-C-003': [{
        rule_id: 'BE-DUP-C-003-no-equivalent-production-code',
        location: { file: 'src/modules/users/name.ts', line: 1, column: 8 },
        evidence: {
            source_tool: 'backend-static',
            source_rule_id: 'BE-DUP-C-003',
            payload: {
                implementation_kind: 'function',
                function_name: 'formatName',
                message: 'Equivalent production functions must reuse one shared implementation.',
                first_file: 'src/modules/contacts/name.ts',
            },
        },
    }],
};

for (const fixture of backendConstraintFixtures) {
    for (const name of ['positive', 'negative', 'nearMiss', 'ignored']) {
        if (!fixture.cases[name]) fixture.cases[name] = empty();
    }
    fixture.cases.negative.expected = negativeExpectations[fixture.ruleId];
}
