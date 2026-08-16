# `ts-nestjs-backend` 规则审计报告

本报告梳理 `harness/rulepacks/ts-nestjs-backend` 下全部 **20 条 canonical constraint 规则**与
**9 条 metric 规则**：每条规则用什么工具实现、检测逻辑怎么写的、fixture 测试覆盖情况，
以及——基于实际运行结果而非假设——这些测试当前是否可信。

审计时间：2026-08-16。审计范围：`harness/` 目录（adapters / core / rulepacks/ts-nestjs-backend）。

> **变更记录**：legacy 规则 `BE-STRUCT-C-002-no-explicit-any`（eslint 实现，此前就不在 canonical 20
> 条集合内）已随其 fixture、manifest 登记、测试断言、eslint 规则配置一并从仓库中移除，Structure 分类
> 现在只剩 `BE-STRUCT-C-001` 一条。本文档已同步更新为移除后的状态。

---

## 0. 结论摘要（TL;DR）

| 项目 | 结论 |
|---|---|
| 20 条 constraint 规则的检测逻辑 | 均已用 fixture 验证过（positive/negative/nearMiss/ignored 四类用例），逻辑可信 |
| fixture 测试的可运行性 | **发现并修复了一个 bug**：测试文件引用的 fixture 路径不存在，导致该测试文件此前 100% 无法运行。修复后 83/83 断言通过 |
| 9 条 metric 规则 | 均有实现，但**没有专门的正确性 fixture 测试**，可信度弱于 constraint 规则 |
| 文档与实现的一致性 | 发现 3 处 YAML 描述与实际实现有出入（见第 5 节），均不影响规则本身是否生效，但会误导阅读 YAML 的人 |

---

## 1. 执行链路总览

一条规则从声明到产出 finding 的完整路径：

```
manifest.yaml（声明规则 + adapter 映射）
   → core/layers/constraints_runner.mjs（constraint 规则）
     或 core/layers/metrics_runner.mjs（metric 规则）
   → 对应 adapter（backend-static / dep-cruiser / contract-diff / computed-metrics / test-coverage；
     eslint adapter 仍声明在 manifest.yaml 里作为通用基础设施，但移除 BE-STRUCT-C-002 后暂无
     constraint 规则引用它，处于闲置状态）
   → adapter 产出 normalized_events（constraint）或 metric_result（metric）
   → constraints_runner 按规则 YAML 的 evidence_sources（adapter + tool_rule_ids + event_type）
     匹配 events，生成 finding
```

**`backend-static`** 是绝大多数 constraint 规则（18/20）的实现载体：
`adapters/backend-static/project.mjs` 用 `@typescript-eslint/parser` 把 `src/` 下每个"生产源文件"（排除
`*.spec.*` / `*.test.*` / `*.story.*` / `*.generated.*` 等，规则见 `adapters/_shared/production-files.mjs`）
解析成一棵 AST，并构建统一的 `project` 模型（import 图、tsconfig 路径别名解析、barrel/`index.ts` 再导出追踪、
`evaluateStatic` 静态表达式求值）。`adapters/backend-static/rules.mjs` 里的 10 个 `analyze*()` 函数都基于这个
共享模型工作，一次解析、多规则复用。

其余 2 条 constraint 规则分别由 `dep-cruiser`（真实运行 dependency-cruiser CLI）和
`contract-diff`（基于 git diff 比较两个 commit 之间 entity/migration 文件的变化）实现。

9 条 metric 规则由 `computed-metrics` adapter 动态加载 `adapters/computed-metrics/implementations/*.mjs`，
或由独立的 `test-coverage` adapter（唯一会真正执行目标项目测试命令的 adapter）实现。

---

## 2. 修复的问题：fixture 测试路径 bug（已修复）

**现象**：`core/tests/backend-constraint-fixtures.test.mjs` 第 15 行原来是：

```js
import { backendConstraintFixtures } from '../../rulepacks/ts-nestjs-backend/fixtures/constraints/backend-constraint-protocol.fixtures.mjs';
```

但真实文件在 `rulepacks/ts-nestjs-backend/fixtures/backend-constraint-protocol.fixtures.mjs`（没有
`constraints/` 这一层子目录）。两个文件是在同一个 commit（`38114de`，"update: harness backend test"）里
一起新增的，路径从一开始就没对上。

**影响**：`node --test core/tests/backend-constraint-fixtures.test.mjs` 直接报
`ERR_MODULE_NOT_FOUND` 整个文件测试失败；`npm test` 汇总显示 1 个文件 fail。**这意味着
`fixtures/README.md` 里描述的"每条规则四类用例"的验证协议，在修复前从未真正跑起来过。**

**验证与修复**：
1. 临时用一个转发文件把缺失路径补上、跑通后确认**当时注册的 21 条规则（20 canonical + legacy
   BE-STRUCT-C-002）共 87 条断言全部通过**（说明规则实现逻辑本身没问题），随后删除临时文件，
   仓库恢复干净状态。
2. 正式修复：把导入路径中多余的 `constraints/` 去掉，与 `fixtures/README.md` 描述的真实路径一致。
3. 复跑验证：

```
$ node --test core/tests/backend-constraint-fixtures.test.mjs
# tests 87 / pass 87 / fail 0

$ npm test   # 完整套件（4 个测试文件）
# tests 99 / pass 99 / fail 0
```

修复已提交。此后 legacy 规则 `BE-STRUCT-C-002` 被整体移除（见第 3 节变更记录），现在跑同一个
命令得到的是 **20 条规则 × 4 类用例 = 80 条 + 3 条 adapter 错误路径测试 = 83 条断言**，详见本文档
第 3 节末尾的最新验证结果。

---

## 3. Constraint 规则逐条梳理（20 条）

fixture 协议对每条规则统一四类用例（见 `fixtures/README.md`）：
- **positive**：符合规范的写法 → 期望 0 条 finding
- **negative**：一个最小违规 → 期望**精确 1 条** finding，并断言完整的 `rule_id`/位置/`evidence` payload
- **nearMiss**：形似但不构成违规的写法 → 期望 0 条 finding（防止误报）
- **ignored**：违规形状出现在 `.spec.ts` 等非生产文件中 → 期望 0 条 finding（防止扫描测试代码）

以下按分类列出；"可信度"一栏基于第 2 节修复后的实际运行结果，而非假设。

### 3.1 Structure

| 规则 | 工具 | 实现位置 | 检测逻辑 | Fixture | 可信度 |
|---|---|---|---|---|---|
| **BE-STRUCT-C-001**<br>module-composition | backend-static | `analyzeStructure()`<br>`rules.mjs:91-143` | 对每个 `src/modules/<x>/x.module.ts`，检查同目录下是否存在 `x.controller.ts`/`x.service.ts`/`x.repository.ts` 三个文件，且都被 `@Module({controllers:[...], providers:[...]})` 元数据实际登记（按 import 绑定名或按 `PascalCase(module)+PascalCase(layer)` 猜测的默认类名匹配）。根 `AppModule` 因不在 `src/modules/<x>/` 下被自然排除 | 4/4 齐全 | ✅ 通过（83 中之一） |

> 此前这里还有一条 legacy 规则 `BE-STRUCT-C-002-no-explicit-any`（eslint 实现，直接复用
> `@typescript-eslint/no-explicit-any`，未自研逻辑，也从未在 canonical 20 条集合内）。已按要求整体移除：
> 规则 YAML、fixture 用例、`negativeExpectations`、manifest 登记、测试期望列表、以及 `eslint.config.js`
> 里专为它加的 `@typescript-eslint/no-explicit-any: 'warn'` 配置行都已删除。

### 3.2 Dependencies

| 规则 | 工具 | 实现位置 | 检测逻辑 | Fixture | 可信度 |
|---|---|---|---|---|---|
| **BE-DEP-C-001**<br>intra-module-layering | backend-static | `analyzeDependencies()`<br>`rules.mjs:145-218`（第一段） | 维护一张禁止的层对表（`forbiddenLayerPairs`，如 `controller:repository`、`service:controller`），对同模块内的每条 import 边按文件名后缀（`.controller.ts`/`.service.ts`/`.repository.ts`/`.entity.ts`）识别源/目标层，命中禁止表即报违规 | 4/4 齐全 | ✅ 通过 |
| **BE-DEP-C-002**<br>infrastructure-isolation | backend-static | 同函数第二段 | `src/common/**` 或 `src/core/**` 下的文件，若其 import（含动态 `import()`）解析目标落在 `src/modules/**`，即违规；`resolveImportPath` 支持 tsconfig `paths` 别名解析，因此 `@modules/*` 这种别名也能被追踪到 | 4/4 齐全（negative 用例专门覆盖了别名 + 动态 import 的组合） | ✅ 通过 |
| **BE-DEP-C-003**<br>framework-layer-purity | backend-static | 同函数第三段 | 文件路径匹配 `guards?/interceptors?/filters?` 目录或 `.guard./.interceptor./.filter.` 后缀时，若其 import 目标层是 `entity` 或 `repository`，即违规 | 4/4 齐全 | ✅ 通过 |
| **BE-DEP-C-004**<br>no-circular-dependencies | dep-cruiser | `tool-configs/dep-cruiser.config.cjs`（`forbidden` 规则 `BE-DEP-C-004-no-circular`，`circular: true` 且排除纯 type-only 边）+ `adapters/dep-cruiser/adapter.mjs` | 真正调用 dependency-cruiser CLI 做环检测，而非自研图算法；type-only 边通过 `dependencyTypesNot: ['type-only']` 被排除，因此 `nearMiss` 用例（互相 `import type`）不应报违规 | 4/4 齐全，另有专门的 adapter 层错误路径测试（超时 / 解析失败） | ✅ 通过 |

### 3.3 Domain boundary

| 规则 | 工具 | 实现位置 | 检测逻辑 | Fixture | 可信度 |
|---|---|---|---|---|---|
| **BE-DOM-C-001**<br>no-cross-module-deep-import | backend-static | `analyzeDomainBoundaries()`<br>`rules.mjs:220-350`（第一段） | 跨模块 import（`sourceModule.owner !== targetModule.owner`）且目标文件不是模块入口（`index.ts` 或 `<owner>.module.ts`）即违规。同名规则也在 `dep-cruiser.config.cjs` 里配置了一份（`BE-DOM-C-001-no-cross-module-deep-import`），供 metric `BE-DOM-M-001` 复用（见 4.3） | 4/4 齐全 | ✅ 通过 |
| **BE-DOM-C-002**<br>no-repository-in-module-exports | backend-static | 同函数第二段 | 对每个模块入口文件（`index.ts`/`<owner>.module.ts`），检查其 `export ... from`（具名/`export *`/`export default`）以及 `@Module({exports:[...]})` 是否间接指向 `.repository.ts`/`.entity.ts`，或导出符号名以 `Repository`/`Entity` 结尾。这是四条中逻辑最复杂的一条（要追踪 re-export 链），实现里用了 `resolveExportTargets` 递归解析 barrel 文件 | 4/4 齐全 | ✅ 通过 |

### 3.4 Error handling

| 规则 | 工具 | 实现位置 | 检测逻辑 | Fixture | 可信度 |
|---|---|---|---|---|---|
| **BE-ERR-C-001**<br>no-http-exception-in-service | backend-static | `analyzeErrors()`<br>`rules.mjs:526-564`，`isHttpExceptionExpression()` | 在 `*.service.ts` 里找 `throw` 语句，判断被抛出的表达式类型是否（递归地，含变量/函数返回值追踪）源自 `@nestjs/common` 的 17 个内置 HTTP 异常类（`HttpException`/`BadRequestException`/…）或继承自它们的本地/跨文件类 | 4/4 齐全（negative 用例用了别名重命名 `BadRequestException as BadInput` 来测试是否会被绕过） | ✅ 通过 |
| **BE-ERR-C-002**<br>throw-only-app-exception | backend-static | 同函数，`isApprovedAppException()` | 同一批 `throw` 语句，若不是"跨文件确认过的合法 `AppException`"（按 `app_exception_sources` 配置的正则匹配来源文件路径）且不是"重新抛出 catch 到的同一个 error 变量"（`catchRethrows()` 白名单），即违规 | 4/4 齐全 | ✅ 通过 |
| **BE-ERR-C-003**<br>no-silent-catch | backend-static | 同函数，`catchBehavior()` | 遍历 `*.service.ts` 里所有 `CatchClause`：空块 → `empty`；块内只有 `console.*`/`logger.*`/`this.logger.*` 调用 → `log-only`；否则视为 `handled`。非 `handled` 均报违规 | 4/4 齐全 | ✅ 通过 |

### 3.5 Contracts

| 规则 | 工具 | 实现位置 | 检测逻辑 | Fixture | 可信度 |
|---|---|---|---|---|---|
| **BE-CONTRACT-C-001**<br>entity-change-requires-migration | contract-diff | `adapters/contract-diff/adapter.mjs` | **唯一基于 git diff 而非单一 commit 快照的规则**：对比 `preCommit`/`postCommit` 两个版本，解析 `*.entity.ts` 里 TypeORM 装饰器字段（`@Column`/`@ManyToOne`/…）的签名变化；再解析同一次 diff 里改动的 migration 文件，粗略检查其 `up()`/`down()` 方法体是否（用去空格后的文本包含关系，`migrationCovers()`）同时提到了对应的表名和列名，且方法体里出现了 `query/addColumn/dropColumn/...` 等操作关键字。**注意**：这是文本层面的"提到了"检查，不校验 DDL 语义是否真的正确执行了该变更——迁移文件内容对但列名恰好没在字符串里出现（比如用变量拼接）会被判定为"未覆盖"；反之列名字符串凑巧出现在无关语句里也会被误判为"已覆盖" | 4/4 齐全（fixture 测试专门起了临时 git 仓库、`git commit` 两次来构造 diff） | ✅ 通过 |
| **BE-CONTRACT-C-002**<br>request-dto-uses-class-validator | backend-static | `analyzeDtoContracts()`<br>`rules.mjs:654-697` | 先从所有 controller 方法里，找被 `@Body()`/`@Query()`/`@Param()`/`@Headers()` 修饰的参数，反查其类型引用到的 DTO 类（`requestDtoClasses()`，含 `PartialType`/`PickType`/`OmitType`/`IntersectionType` 的基类链追踪）；再检查每个 DTO 属性是否有至少一个来自 `class-validator` 包的装饰器 | 4/4 齐全 | ✅ 通过 |
| **BE-CONTRACT-C-003**<br>optional-request-properties-validate-values | backend-static | 同函数 | 属性若"可选"（`?` 标记，或有 `@IsOptional()`，或继承自已被判定为可选基类的映射类型），但除了 `IsOptional`/`ValidateIf`/`Allow`（`NON_VALUE_VALIDATORS`，这些只表达"是否校验"而不校验值本身）之外没有其他 validator，即违规 | 4/4 齐全 | ✅ 通过 |
| **BE-CONTRACT-C-004**<br>validation-pipe-whitelisting | backend-static | `analyzeValidationPipe()`<br>`rules.mjs:707-757` | 全项目扫描 `useGlobalPipes(...)` 调用和 `{ provide: APP_PIPE, ... }` 形态的 provider，找出其中构造的 `new ValidationPipe(options)`，用 `evaluateStatic` 静态求值 `options` 对象；只要**存在一个** `whitelist === true && forbidNonWhitelisted === true` 的实例就算合规（"存在一个合规实例即通过"，不检查是否有其它冲突配置） | 4/4 齐全 | ✅ 通过 |

### 3.6 Testability / Size

| 规则 | 工具 | 实现位置 | 检测逻辑 | Fixture | 可信度 |
|---|---|---|---|---|---|
| **BE-TEST-C-001**<br>no-direct-repository-construction | backend-static | `analyzeTestabilityAndSize()`<br>`rules.mjs:841-895`（第一段） | 在 `*.service.ts` 里找 `new X()`，若 `X` 是从某处导入的 `Repository`（TypeORM 原始类）或名字以 `Repository` 结尾的类，或其解析到的目标文件按后缀判定为 repository 层，即违规；另外单独处理了 `Reflect.construct(...)` 这种反射构造的等价写法 | 4/4 齐全 | ✅ 通过 |
| **BE-SIZE-C-001**<br>max-method-parameters | backend-static | 同函数第二段 | `*.controller/.service/.repository.ts` 里非构造函数的方法，参数个数 > 3 即违规（阈值硬编码在 `rules.mjs`，metric 侧的阈值来自配置文件，见 4.9） | 4/4 齐全 | ✅ 通过 |

### 3.7 Routes

| 规则 | 工具 | 实现位置 | 检测逻辑 | Fixture | 可信度 |
|---|---|---|---|---|---|
| **BE-ROUTE-C-001**<br>api-prefix-and-kebab-case | backend-static | `analyzeRoutes()`<br>`rules.mjs:777-839` | 两部分：① `src/main.ts` 里 `setGlobalPrefix(...)` 的参数用 `evaluateStatic` 求值（**支持解析常量标识符**，如 `const API_PREFIX='api'; setGlobalPrefix(API_PREFIX)`），去掉首尾斜杠后必须等于 `api`；若传了 `exclude` 选项则整体违规。② 每个 controller 类的 `@Controller(...)` 和 HTTP 方法装饰器（`@Get/@Post/...`）参数（含字符串数组形式）逐段用 `isKebabRoute()` 校验：允许 `v\d+` 版本号段、`:param` 参数段、`*`/`{*splat}` 通配段，其余必须是纯 kebab-case | 4/4 齐全（nearMiss 用例专门覆盖了版本号数组路径 + `{*splat}` 通配符） | ✅ 通过 |

### 3.8 Duplication

| 规则 | 工具 | 实现位置 | 检测逻辑 | Fixture | 可信度 |
|---|---|---|---|---|---|
| **BE-DUP-C-001**<br>single-resource-owner | backend-static | `analyzeResourceOwners()`<br>`rules.mjs:919-972` | 把 module 名 / controller 路由 / entity 表名都归一化（`normalizeResource()`：去版本号段、去 `.module`/`.controller`/`.entity` 后缀、驼峰转 kebab、去复数），按"资源种类 + 归一化名 + URI 版本号"分组；同一分组内出现来自不同文件的第二个所有者即违规。版本号（`v1`/`v2`）被独立追踪，因此 `/v1/users` 和 `/v2/users` 不会互相冲突（nearMiss 用例专门验证了这点） | 4/4 齐全 | ✅ 通过 |
| **BE-DUP-C-002**<br>single-policy-implementation | backend-static | `analyzePolicyAndCodeDuplication()`<br>`rules.mjs:1002-1063`（policy 分支） | 变量名或函数名匹配 `POLICY_NAME_RE`（形如 `allowed*`/`*policy*`/`can*`/`validate*`/`assert*` 等）的常量（数组/对象/`new` 表达式）或函数，用"参数名归一化后的 AST 指纹"（`canonicalAst()`，剥离 `loc`/`range`/装饰器等无关字段，参数名统一替换为 `p0`/`p1`/…）判等；同名 + 同指纹 + 不同文件即判定为重复实现 | 4/4 齐全 | ✅ 通过 |
| **BE-DUP-C-003**<br>no-equivalent-production-code | backend-static | 同函数，非 policy 分支 | 对所有函数/方法（不含构造函数），若函数体源码去空白后长度 < 24 字符则直接跳过（避免短小样板代码产生噪音），否则用同一套 AST 指纹判等；**注意这条不要求名字相同**，只要函数体结构一致就算重复 | 4/4 齐全 | ✅ 通过 |

**小结**：20 条 constraint 规则中，18 条由 `backend-static` 自研 AST 分析实现，逻辑集中在
`adapters/backend-static/rules.mjs` 一个 1078 行文件里，`project.mjs` 提供公共的解析/解析导入/静态求值能力；
其余分别复用 `dep-cruiser`（1条真实环检测）、`contract-diff`（1条 git diff 专用逻辑）。
移除 legacy 规则 `BE-STRUCT-C-002` 并修复第 2 节的路径问题后，实测：

```
$ node --test core/tests/backend-constraint-fixtures.test.mjs
# tests 83 / pass 83 / fail 0
```

**全部 20 条规则 × 4 类用例 = 80 条断言 + 3 条独立的 adapter 错误路径测试 = 83 条断言全部通过**，
逻辑可信度高。

---

## 4. Metric 规则逐条梳理（9 条）

与 constraint 不同，metric 规则输出的是一个连续数值（比例/计数/百分比），不是"违规/不违规"的二元判断，
因此 fixture 协议（positive/negative/nearMiss/ignored）**不适用**于 metric。

> ⚠️ **可信度警告**：9 条 metric 规则目前**没有专门的正确性 fixture 测试**。仓库里唯一涉及它们的测试
> 是 `core/tests/production-files.test.mjs` 里的 "computed production metrics ignore non-production
> files" 一条，只验证了"metric 实现会正确跳过 `.spec.ts` 等非生产文件"，**不验证公式本身、分母口径、
> 边界条件是否正确**。下文每条 metric 都会标注它与对应 constraint 规则口径是否一致——这是目前唯一能
> 交叉验证 metric 正确性的手段。

| 规则 | 实现文件 | 公式 | 数据来源 | 与对应 constraint 的口径一致性 |
|---|---|---|---|---|
| **BE-STRUCT-M-001**<br>module-composition-violation-ratio | `implementations/module-composition-violation-ratio.mjs` | `violating_modules / total_modules` | 直接扫描文件系统（不复用 backend-static 的 AST 结果） | ⚠️ **不一致**：constraint（3.1）对每个 module 固定要求 controller+service+repository 三者齐全并在 `@Module` 元数据里登记；metric 用 `classifyModule()` 按目录里是否存在 `*.entity.ts` 文件动态决定必需层（`link`→仅 controller+service；有 entity→三者；否则→仅 service），且**完全不检查 `@Module` 元数据登记**，只检查文件是否存在。YAML 里的 `methodological_note` 声称"repository 保持可选以与 C-001 保持一致"，但 C-001 从未把 repository 设为可选——这是文档与实现的双重出入 |
| **BE-DEP-M-001**<br>dependency-violation-density | `implementations/dependency-violation-density.mjs` | `(mvc_direction_violations + cyclic_dependency_count) / total_import_edges` | 自行解析 dep-cruiser 原始 JSON 报告（`depcruise-raw.json`）里的全部 import 边，用文件后缀正则判层，用 Tarjan 强连通分量算法自己重新计算环，**不复用** dep-cruiser 配置里已经跑出来的 `BE-DEP-C-004-no-circular` 规则标记 | 独立实现，与 BE-DEP-C-001/004 是平行的两套判定逻辑，数值不能直接与 constraint 的 finding 数对齐 |
| **BE-DOM-M-001**<br>cross-module-deep-import-count | `implementations/cross-module-deep-import-count.mjs` | `count(边被 dep-cruiser 标记为 BE-DOM-C-001-no-cross-module-deep-import)` | 同样读 `depcruise-raw.json`，但这次**是**筛选 `dep.rules` 里名字等于 `BE-DOM-C-001-no-cross-module-deep-import` 的边（该规则在 `tool-configs/dep-cruiser.config.cjs` 里确有配置） | ✅ 一致：这条 metric 复用的是 dep-cruiser 侧配置的同名规则标记，但注意它与 constraint BE-DOM-C-001（backend-static 实现）是**两套独立引擎**在各自判定同一件事，只是恰好用了同一个规则名 |
| **BE-ERR-M-001**<br>exception-unification-violation-density | `implementations/exception-unification-violation-density.mjs` | `sum(weight_i × BE-ERR-C-00{1,2,3}的finding数) / max(1, service文件数)` | **真正复用** `constraintsLayer.findings_by_rule` 里 BE-ERR-C-001/002/003 已经算出来的 finding 数量（不是重新扫描） | ✅ 一致（唯一一条分子直接复用 constraint 结果的 metric）；分母（service 文件数）用独立的目录遍历统计，与 constraint 用的 `project.files` 集合逻辑上等价但实现上是两套代码 |
| **BE-CONTRACT-M-001**<br>dto-validator-coverage | `implementations/dto-validator-coverage.mjs` → `_shared/backend-source-analysis.mjs::analyzeDtoValidatorCoverage()` | `covered_fields / total_fields` | 独立扫描所有 `dto/*.ts` 目录下、类名以 `Dto` 结尾且不以 `ResponseDto` 结尾的类 | ⚠️ **口径更宽**：constraint BE-CONTRACT-C-002 只统计"确实被某个 controller 方法用 `@Body/@Query/@Param/@Headers` 引用"的 DTO；metric 统计的是**所有**符合命名规则的 DTO 文件，不要求被实际引用。也就是说 metric 的分母可能包含从未被当作请求体使用过的 DTO 类 |
| **BE-TEST-M-001**<br>test-coverage | `adapters/test-coverage/adapter.mjs`（独立 adapter，非 computed-metrics） | `coverage-summary.json` 的 `total.lines.pct` | **真实执行**目标项目的测试命令（配置里是 `npm run test:cov -- --coverageReporters=json-summary`），是全部 29 条规则里唯一会跑被测项目本身测试套件的一条 | 不适用（无对应 constraint） |
| **BE-TEST-M-002**<br>mock-per-test-case | `implementations/mock-per-test-case.mjs` → `analyzeMockUsage()` | `mocks / test_cases` | 扫描 `*.spec.ts`/`*.test.ts`，把 `it(`/`test(` 调用计为用例，`jest.mock`/`jest.spyOn`/`useValue`/`useFactory`/`useClass` 计为 mock | 启发式统计，无对应 constraint 可比对；`useValue`/`useFactory`/`useClass` 属性名匹配不检查上下文，理论上任意对象字面量里出现同名属性都会被计数（例如业务代码里恰好有个 `useFactory` 字段） |
| **BE-ROUTE-M-001**<br>route-prefix-violation-ratio | `implementations/route-prefix-violation-ratio.mjs` → `analyzeRoutes()`（backend-source-analysis.mjs 版本，与 rules.mjs 里同名函数是两份独立实现） | `violating_endpoints / total_endpoints` | 独立扫描 | ⚠️ **发现一处实测会导致不同判定结果的差异**：metric 版判断全局前缀时用 `getLiteralStringValue()`，**只认字面量字符串**，不解析标识符；而 constraint BE-ROUTE-C-001（3.7）用 `evaluateStatic()`，能解析出 `const API_PREFIX = 'api'; setGlobalPrefix(API_PREFIX)` 这种写法。BE-ROUTE-C-001 自己的 positive fixture 用的就是这种"常量+标识符"写法——用同一份代码去跑 metric 版本，会被误判为"未设置 /api 前缀"，而 constraint 判定为合规。两者对同一份代码会给出不同结论 |
| **BE-SIZE-M-001**<br>method-parameter-violation-ratio | `implementations/method-parameter-violation-ratio.mjs` → `analyzeMethodParameters()` | `violating_methods / total_methods`，阈值来自 `metrics.config.json` 的 `max_parameters`（当前配置为 3） | 独立扫描 `*.controller/.service/.repository.ts`，排除构造函数 | ✅ 口径一致：排除范围、阈值都与 constraint BE-SIZE-C-001（3.6）一致 |

---

## 5. 文档（YAML）与实现不一致的地方

以下三处不影响规则**是否生效**（因为 metric 的调度只看 YAML 的 `adapter`/`implementation` 字段，
`core/layers/metrics_runner.mjs` 从不读取 metric YAML 里的 `evidence_sources` 块），但会误导只读 YAML
不读代码的人：

1. **`BE-DEP-M-001-dependency-violation-density.yaml`** 的 `evidence_sources` 写着
   `adapter: dep-cruiser`、`tool_rule_ids: [no-orphans, no-circular]`、
   `match_condition.artifact: baseline/reports/depcruise-raw.json`——但 `no-orphans`/`no-circular`
   并不是 `tool-configs/dep-cruiser.config.cjs` 里配置的真实规则名（真实规则名是
   `BE-DEP-C-004-no-circular`），而且这个 metric 的真实实现完全不走 `evidence_sources` 匹配这条路径，
   是自己重新解析 JSON 报告、自己跑 Tarjan 算法。这段 `evidence_sources` 是过时的遗留描述。
2. **`BE-DOM-M-001-cross-module-deep-import-count.yaml`** 同样只有 `methodological_note` 里的散文描述
   是准确的（"复用 dep-cruiser 里 BE-DOM-C-001 标记的边"），没有独立的 `evidence_sources` 结构化字段——
   建议把散文描述结构化，但目前不算错误，只是和其它 metric YAML 的字段风格不一致。
3. **`BE-STRUCT-M-001-module-composition-violation-ratio.yaml`** 的 `methodological_note` 声称
   "repository 可选，与 C-001 保持一致"——如第 4 节表格所述，这个说法与两份代码的实际行为都对不上
   （C-001 从不把 repository 设为可选；metric 是否要求 repository 取决于是否存在 `*.entity.ts`，
   跟"可选"也不是一回事）。

---

## 6. 总体可信度结论

- **20 条 constraint 规则**：实现逻辑集中、单一数据源（`backend-static` 的共享 `project` AST 模型，或对应
  的外部工具真实执行），每条规则都有 positive/negative/nearMiss/ignored 四类 fixture，且——在修复第 2 节
  的路径 bug、移除 legacy 规则 `BE-STRUCT-C-002` 之后——**83 条断言全部实测通过**。这部分的可信度有直接
  证据支撑，不是假设。
- **9 条 metric 规则**：均有实现且能跑，但缺少专门的正确性测试，只有"不扫描非生产文件"这一条间接验证。
  逐条比对后发现 **3 条 metric 与其对应的 constraint 规则口径不一致**（BE-STRUCT-M-001 的必需层判定、
  BE-CONTRACT-M-001 的 DTO population、BE-ROUTE-M-001 的前缀标识符解析），其中 BE-ROUTE-M-001 那处差异
  已经用 BE-ROUTE-C-001 自己的 positive fixture 反向验证过——同一段代码，metric 和 constraint 会给出不同结论。
  如果研究结论依赖这几条 metric 的绝对数值或跨样本比较，建议：
  1. 对这三条 metric 补充与对应 constraint 相同基准的单元测试；
  2. 或者在解读 metric 数值时，明确说明其分子/分母口径与同名 constraint 不完全等价。
- 本次审计未涉及 frontend / cross 规则包，也未评估 `core/aggregators`、`core/comparison` 等聚合与快照比较
  层的正确性。
