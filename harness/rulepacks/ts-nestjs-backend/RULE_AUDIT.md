# `ts-nestjs-backend` 规则审计报告

本报告梳理 `harness/rulepacks/ts-nestjs-backend` 下全部 **20 条 constraint 规则**与
**10 条 metric 规则**：每条规则用什么工具实现、检测逻辑怎么写、fixture/单元测试覆盖情况，以及
——基于实际运行结果而非假设——这些测试当前是否可信。全文只记录当前实现的真实状态，不包含变更历史。

---

## 0. 结论摘要（TL;DR）

| 项目 | 结论 |
|---|---|
| 20 条 constraint 规则的检测逻辑 | 均已用 fixture 验证过（positive/negative/nearMiss/ignored 四类用例），逻辑可信 |
| fixture 测试的可运行性 | `node --test core/tests/backend-constraint-fixtures.test.mjs` → **83/83 断言通过**（20 条规则 × 4 类用例 = 80 条 + 3 条独立的 adapter 错误路径测试） |
| 10 条 metric 规则的测试覆盖 | **全部 10 条都有专门的正确性单元测试**（`core/tests/backend-*-metric.test.mjs`，见第 3 节末尾清单），每条按"合规基线 / 精确违规数值 / 近似不触发 / 非生产文件排除"四类场景覆盖，用精确数值断言而非笼统的真假判断 |
| metric 与 constraint 的口径一致性 | 10 条里 6 条口径一致或基本一致，2 条已知口径更宽（`BE-STRUCT-M-001`、`BE-CONTRACT-M-001`），1 条与其对标 constraint 概念上已经分道（`BE-SIZE-M-001`，见第 3 节），1 条无对应 constraint（`BE-DUP-M-001`，独立填补空白） |
| 文档与实现的一致性 | 3 处规则 YAML 里的 `evidence_sources`/`methodological_note` 描述与实际实现不符（见第 4 节），不影响规则是否生效，但会误导只读 YAML 的人 |

---

## 1. 执行链路总览

一条规则从声明到产出 finding/metric_result 的完整路径：

```
manifest.yaml（声明规则 + adapter 映射）
   → core/layers/constraints_runner.mjs（constraint 规则）
     或 core/layers/metrics_runner.mjs（metric 规则）
   → 对应 adapter（backend-static / dep-cruiser / contract-diff / computed-metrics / test-coverage；
     eslint adapter 仍声明在 manifest.yaml 里作为通用基础设施，但当前没有任何 constraint 规则引用它，
     处于闲置状态）
   → adapter 产出 normalized_events（constraint）或 metric_result（metric）
   → constraints_runner 按规则 YAML 的 evidence_sources（adapter + tool_rule_ids + event_type）
     匹配 events，生成 finding
```

**`backend-static`** 是 18/20 条 constraint 规则的实现载体，代码组织为：

```
adapters/backend-static/
  project.mjs        — 共享的 AST/项目模型：解析每个生产源文件、构建 import 图、tsconfig 别名解析、
                        barrel/index.ts 再导出追踪、evaluateStatic 静态表达式求值
  rules/
    index.mjs         — analyzeBackendRules() 入口，按序拼接下面每个分类的 analyze*()
    shared.mjs         — 跨分类复用的小工具（violation/moduleParts/layerOf/findModuleDecorator/
                          expressionType/importedSymbol 等），含导出给 metric 层复用的
                          FORBIDDEN_LAYER_PAIRS 常量
    structure.mjs       — BE-STRUCT-C-001
    dependencies.mjs     — BE-DEP-C-001/002/003
    domain-boundaries.mjs — BE-DOM-C-001/002
    errors.mjs            — BE-ERR-C-001/002/003
    contracts.mjs          — BE-CONTRACT-C-002/003/004
    routes.mjs               — BE-ROUTE-C-001（isKebabRoute 已导出，供 metric 层复用）
    testability-size.mjs      — BE-TEST-C-001、BE-SIZE-C-001
    duplication.mjs            — BE-DUP-C-001/002/003
```

其余 2 条 constraint 规则分别由 `dep-cruiser`（真实运行 dependency-cruiser CLI，`BE-DEP-C-004`）和
`contract-diff`（基于 git diff 比较两个 commit 之间 entity/migration 文件的变化，`BE-CONTRACT-C-001`）实现。

10 条 metric 规则中，9 条由 `computed-metrics` adapter 动态加载
`adapters/computed-metrics/implementations/backend/*.mjs`（文件名即规则 ID，如 `BE-DEP-M-001.mjs`；
manifest 里 `computed-metrics` adapter 的 `options.implementations_root` 指向 `implementations/backend`），
`BE-TEST-M-001` 由独立的 `test-coverage` adapter 实现（唯一会真正执行目标项目测试命令的 adapter）。
多条 backend metric 共用的辅助分析逻辑集中在 `adapters/computed-metrics/implementations/backend/
backend-source-analysis.mjs`（单文件、AST 扫描辅助函数 + 4 个 `analyze*()` 主体逻辑），依赖读取
dep-cruiser 原始报告的 metric 共用 `.../backend/report-io.mjs`，跨 metric 通用的结果封装（`buildMetricResult`
等）在上一级 `implementations/_shared/metric-result.mjs`。

---

## 2. Constraint 规则逐条梳理（20 条）

fixture 协议对每条规则统一四类用例（见 `fixtures/README.md`）：
- **positive**：符合规范的写法 → 期望 0 条 finding
- **negative**：一个最小违规 → 期望**精确 1 条** finding，并断言完整的 `rule_id`/位置/`evidence` payload
- **nearMiss**：形似但不构成违规的写法 → 期望 0 条 finding（防止误报）
- **ignored**：违规形状出现在 `.spec.ts` 等非生产文件中 → 期望 0 条 finding（防止扫描测试代码）

### 2.1 Structure

| 规则 | 工具 | 实现位置 | 检测逻辑 | Fixture | 可信度 |
|---|---|---|---|---|---|
| **BE-STRUCT-C-001**<br>module-composition | backend-static | `analyzeStructure()`<br>`rules/structure.mjs:11-63` | 对每个 `src/modules/<x>/x.module.ts`，检查同目录下是否存在 `x.controller.ts`/`x.service.ts`/`x.repository.ts` 三个文件，且都被 `@Module({controllers:[...], providers:[...]})` 元数据实际登记（按 import 绑定名或按 `PascalCase(module)+PascalCase(layer)` 猜测的默认类名匹配）。根 `AppModule` 因不在 `src/modules/<x>/` 下被自然排除 | 4/4 齐全 | ✅ 通过 |

### 2.2 Dependencies

| 规则 | 工具 | 实现位置 | 检测逻辑 | Fixture | 可信度 |
|---|---|---|---|---|---|
| **BE-DEP-C-001**<br>intra-module-layering | backend-static | `analyzeDependencies()`<br>`rules/dependencies.mjs:18-82` | 维护一张禁止的层对表（`export const FORBIDDEN_LAYER_PAIRS`，如 `controller:repository`、`service:controller`——现已导出，供 `BE-DEP-M-001` metric 直接复用），对同模块内的每条 import 边按文件名后缀（`.controller.ts`/`.service.ts`/`.repository.ts`/`.entity.ts`）识别源/目标层，命中禁止表即报违规 | 4/4 齐全 | ✅ 通过 |
| **BE-DEP-C-002**<br>infrastructure-isolation | backend-static | 同函数第二段 | `src/common/**` 或 `src/core/**` 下的文件，若其 import（含动态 `import()`）解析目标落在 `src/modules/**`，即违规；`resolveImportPath` 支持 tsconfig `paths` 别名解析，因此 `@modules/*` 这种别名也能被追踪到 | 4/4 齐全（negative 用例专门覆盖了别名 + 动态 import 的组合） | ✅ 通过 |
| **BE-DEP-C-003**<br>framework-layer-purity | backend-static | 同函数第三段 | 文件路径匹配 `guards?/interceptors?/filters?` 目录或 `.guard./.interceptor./.filter.` 后缀时，若其 import 目标层是 `entity` 或 `repository`，即违规 | 4/4 齐全 | ✅ 通过 |
| **BE-DEP-C-004**<br>no-circular-dependencies | dep-cruiser | `tool-configs/dep-cruiser.config.cjs`（`forbidden` 规则 `BE-DEP-C-004-no-circular`，`circular: true` 且排除纯 type-only 边）+ `adapters/dep-cruiser/adapter.mjs` | 真正调用 dependency-cruiser CLI 做环检测，而非自研图算法；type-only 边通过 `dependencyTypesNot: ['type-only']` 被排除，因此 `nearMiss` 用例（互相 `import type`）不应报违规 | 4/4 齐全，另有专门的 adapter 层错误路径测试（超时 / 解析失败） | ✅ 通过 |

### 2.3 Domain boundary

| 规则 | 工具 | 实现位置 | 检测逻辑 | Fixture | 可信度 |
|---|---|---|---|---|---|
| **BE-DOM-C-001**<br>no-cross-module-deep-import | backend-static | `analyzeDomainBoundaries()`<br>`rules/domain-boundaries.mjs:15-145`（第一段） | 跨模块 import（`sourceModule.owner !== targetModule.owner`）且目标文件不是模块入口（`index.ts` 或 `<owner>.module.ts`）即违规。同名规则也在 `dep-cruiser.config.cjs` 里配置了一份（`BE-DOM-C-001-no-cross-module-deep-import`），供 metric `BE-DOM-M-001` 复用（见第 3 节） | 4/4 齐全 | ✅ 通过 |
| **BE-DOM-C-002**<br>no-repository-in-module-exports | backend-static | 同函数第二段 | 对每个模块入口文件（`index.ts`/`<owner>.module.ts`），检查其 `export ... from`（具名/`export *`/`export default`）以及 `@Module({exports:[...]})` 是否间接指向 `.repository.ts`/`.entity.ts`，或导出符号名以 `Repository`/`Entity` 结尾。这是两条中逻辑最复杂的一条（要追踪 re-export 链），实现里用了 `resolveExportTargets` 递归解析 barrel 文件 | 4/4 齐全 | ✅ 通过 |

### 2.4 Error handling

| 规则 | 工具 | 实现位置 | 检测逻辑 | Fixture | 可信度 |
|---|---|---|---|---|---|
| **BE-ERR-C-001**<br>no-http-exception-in-service | backend-static | `analyzeErrors()`<br>`rules/errors.mjs:157-195`，`isHttpExceptionExpression()`（第63行） | 在 `*.service.ts` 里找 `throw` 语句，判断被抛出的表达式类型是否（递归地，含变量/函数返回值追踪）源自 `@nestjs/common` 的 17 个内置 HTTP 异常类（`HttpException`/`BadRequestException`/…）或继承自它们的本地/跨文件类 | 4/4 齐全（negative 用例用了别名重命名 `BadRequestException as BadInput` 来测试是否会被绕过） | ✅ 通过 |
| **BE-ERR-C-002**<br>throw-only-app-exception | backend-static | 同函数，`isApprovedAppException()`（第87行） | 同一批 `throw` 语句，若不是"跨文件确认过的合法 `AppException`"（按 `app_exception_sources` 配置的正则匹配来源文件路径）且不是"重新抛出 catch 到的同一个 error 变量"（`catchRethrows()` 白名单，第120行），即违规 | 4/4 齐全 | ✅ 通过 |
| **BE-ERR-C-003**<br>no-silent-catch | backend-static | 同函数，`catchBehavior()`（第133行） | 遍历 `*.service.ts` 里所有 `CatchClause`：空块 → `empty`；块内只有 `console.*`/`logger.*`/`this.logger.*` 调用 → `log-only`；否则视为 `handled`。非 `handled` 均报违规 | 4/4 齐全 | ✅ 通过 |

### 2.5 Contracts

| 规则 | 工具 | 实现位置 | 检测逻辑 | Fixture | 可信度 |
|---|---|---|---|---|---|
| **BE-CONTRACT-C-001**<br>entity-change-requires-migration | contract-diff | `adapters/contract-diff/adapter.mjs` | **唯一基于 git diff 而非单一 commit 快照的规则**：对比 `preCommit`/`postCommit` 两个版本，解析 `*.entity.ts` 里 TypeORM 装饰器字段（`@Column`/`@ManyToOne`/…）的签名变化；再解析同一次 diff 里改动的 migration 文件，检查其 `up()`/`down()` 方法体是否（去空格后的文本包含关系）同时提到了对应的表名和列名，且方法体里出现了 `query/addColumn/dropColumn/...` 等操作关键字。这是文本层面的"提到了"检查，不校验 DDL 语义是否真的正确执行了该变更 | 4/4 齐全（fixture 测试专门起了临时 git 仓库、`git commit` 两次来构造 diff） | ✅ 通过 |
| **BE-CONTRACT-C-002**<br>request-dto-uses-class-validator | backend-static | `analyzeDtoContracts()`<br>`rules/contracts.mjs:97-141` | 先从所有 controller 方法里，找被 `@Body()`/`@Query()`/`@Param()`/`@Headers()` 修饰的参数，反查其类型引用到的 DTO 类（`requestDtoClasses()`，第64行，含 `PartialType`/`PickType`/`OmitType`/`IntersectionType` 的基类链追踪）；再检查每个 DTO 属性是否有至少一个来自 `class-validator` 包的装饰器 | 4/4 齐全 | ✅ 通过 |
| **BE-CONTRACT-C-003**<br>optional-request-properties-validate-values | backend-static | 同函数 | 属性若"可选"（`?` 标记，或有 `@IsOptional()`，或继承自已被判定为可选基类的映射类型），但除了 `IsOptional`/`ValidateIf`/`Allow`（这些只表达"是否校验"而不校验值本身）之外没有其他 validator，即违规 | 4/4 齐全 | ✅ 通过 |
| **BE-CONTRACT-C-004**<br>validation-pipe-whitelisting | backend-static | `analyzeValidationPipe()`<br>`rules/contracts.mjs:150-200` | 全项目扫描 `useGlobalPipes(...)` 调用和 `{ provide: APP_PIPE, ... }` 形态的 provider，找出其中构造的 `new ValidationPipe(options)`，用 `evaluateStatic` 静态求值 `options` 对象；只要**存在一个** `whitelist === true && forbidNonWhitelisted === true` 的实例就算合规 | 4/4 齐全 | ✅ 通过 |

### 2.6 Testability / Size

| 规则 | 工具 | 实现位置 | 检测逻辑 | Fixture | 可信度 |
|---|---|---|---|---|---|
| **BE-TEST-C-001**<br>no-direct-repository-construction | backend-static | `analyzeTestabilityAndSize()`<br>`rules/testability-size.mjs:6-60`（第一段） | 在 `*.service.ts` 里找 `new X()`，若 `X` 是从某处导入的 `Repository`（TypeORM 原始类）或名字以 `Repository` 结尾的类，或其解析到的目标文件按后缀判定为 repository 层，即违规；另外单独处理了 `Reflect.construct(...)` 这种反射构造的等价写法 | 4/4 齐全 | ✅ 通过 |
| **BE-SIZE-C-001**<br>max-method-parameters | backend-static | 同函数第二段 | `*.controller/.service/.repository.ts` 里非构造函数的方法，参数个数 > 3 即违规（阈值硬编码在 `testability-size.mjs`）。**注意**：这条 constraint 检测的仍然是参数个数，跟第 4 节的同分类 metric `BE-SIZE-M-001`（已改为圈复杂度）**不再是同一件事的连续化版本**，两者衡量的是"方法过大"这个问题的两个不同侧面 | 4/4 齐全 | ✅ 通过 |

### 2.7 Routes

| 规则 | 工具 | 实现位置 | 检测逻辑 | Fixture | 可信度 |
|---|---|---|---|---|---|
| **BE-ROUTE-C-001**<br>api-prefix-and-kebab-case | backend-static | `analyzeRoutes()`<br>`rules/routes.mjs:29-91` | 两部分：① `src/main.ts` 里 `setGlobalPrefix(...)` 的参数用 `evaluateStatic` 求值（**支持解析常量标识符**，如 `const API_PREFIX='api'; setGlobalPrefix(API_PREFIX)`），去掉首尾斜杠后必须等于 `api`；若传了 `exclude` 选项则整体违规。② 每个 controller 类的 `@Controller(...)` 和 HTTP 方法装饰器（`@Get/@Post/...`）参数（含字符串数组形式）逐段用 `isKebabRoute()`（第11行，已导出）校验：允许 `v\d+` 版本号段、`:param` 参数段、`*`/`{*splat}` 通配段，其余必须是纯 kebab-case | 4/4 齐全（nearMiss 用例专门覆盖了版本号数组路径 + `{*splat}` 通配符） | ✅ 通过 |

### 2.8 Duplication

| 规则 | 工具 | 实现位置 | 检测逻辑 | Fixture | 可信度 |
|---|---|---|---|---|---|
| **BE-DUP-C-001**<br>single-resource-owner | backend-static | `analyzeResourceOwners()`<br>`rules/duplication.mjs:32-86` | 把 module 名 / controller 路由 / entity 表名都归一化（`normalizeResource()`：去版本号段、去 `.module`/`.controller`/`.entity` 后缀、驼峰转 kebab、去复数），按"资源种类 + 归一化名 + URI 版本号"分组；同一分组内出现来自不同文件的第二个所有者即违规。版本号（`v1`/`v2`）被独立追踪，因此 `/v1/users` 和 `/v2/users` 不会互相冲突 | 4/4 齐全 | ✅ 通过 |
| **BE-DUP-C-002**<br>single-policy-implementation | backend-static | `analyzePolicyAndCodeDuplication()`<br>`rules/duplication.mjs:115-176`（policy 分支） | 变量名或函数名匹配 `POLICY_NAME_RE`（形如 `allowed*`/`*policy*`/`can*`/`validate*`/`assert*` 等）的常量（数组/对象/`new` 表达式）或函数，用"参数名归一化后的 AST 指纹"（`canonicalAst()`，第87行）判等；同名 + 同指纹 + 不同文件即判定为重复实现 | 4/4 齐全 | ✅ 通过 |
| **BE-DUP-C-003**<br>no-equivalent-production-code | backend-static | 同函数，非 policy 分支 | 对所有函数/方法（不含构造函数），若函数体源码去空白后长度 < 24 字符则直接跳过（避免短小样板代码产生噪音），否则用同一套 AST 指纹判等；这条不要求名字相同，只要函数体结构一致就算重复 | 4/4 齐全 | ✅ 通过 |

**小结**：20 条 constraint 规则中，18 条由 `backend-static` 自研 AST 分析实现，代码组织在
`adapters/backend-static/rules/` 目录下 8 个按分类拆分的文件里（`shared.mjs` 提供跨分类复用的公共
工具），`project.mjs` 提供解析/import 解析/静态求值等公共能力；其余分别复用 `dep-cruiser`（1条真实环
检测）、`contract-diff`（1条 git diff 专用逻辑）。实测：

```
$ node --test core/tests/backend-constraint-fixtures.test.mjs
# tests 83 / pass 83 / fail 0
```

**全部 20 条规则 × 4 类用例 = 80 条断言 + 3 条独立的 adapter 错误路径测试 = 83 条断言全部通过**，
逻辑可信度高。

---

## 3. Metric 规则逐条梳理（10 条）

与 constraint 不同，metric 规则输出的是一个连续数值（比例/计数/百分比），不是"违规/不违规"的二元判断，
因此 fixture 协议（positive/negative/nearMiss/ignored）**不适用**于 metric。

> ✅ **测试覆盖**：全部 10 条 metric 都有专门的正确性单元测试（合成项目 + 精确数值断言，不是笼统的
> "应该 > 0"），每条按"合规基线 / 精确违规数值 / 近似不触发（false-positive 防护）/ 非生产文件排除"
> 四类场景覆盖，具体测试文件见本节末尾清单。下表每条 metric 仍标注了它与对应 constraint 规则口径是否
> 一致——这部分口径差异是设计层面的已知事实，不是测试能覆盖掉的问题，需要在解读数值时单独考虑。

| 规则 | 实现文件 | 公式 | 数据来源 | 与对应 constraint 的口径一致性 |
|---|---|---|---|---|
| **BE-STRUCT-M-001**<br>module-composition-violation-ratio | `implementations/backend/BE-STRUCT-M-001.mjs` | `violating_modules / total_modules` | 直接扫描文件系统（不复用 backend-static 的 AST 结果） | ⚠️ **不一致**：constraint（2.1）对每个 module 固定要求 controller+service+repository 三者齐全并在 `@Module` 元数据里登记；metric 按目录里是否存在 `*.entity.ts` 文件动态决定必需层，且**完全不检查 `@Module` 元数据登记**，只检查文件是否存在。规则 YAML 里的 `methodological_note` 此前声称"repository 保持可选以与 C-001 保持一致"，已在 YAML 层面修正（见第 4 节），但 `.mjs` 实现本身的判定逻辑未改动，此处记录的口径差异依然存在 |
| **BE-DEP-M-001**<br>dependency-violation-density | `implementations/backend/BE-DEP-M-001.mjs` | `(layering_violations + cyclic_dependency_count) / total_import_edges` | 自行解析 dep-cruiser 原始 JSON 报告（`depcruise-raw.json`）里的全部 import 边 | ✅ **分层违规部分已与 constraint 对齐**：`isLayeringViolation()` 直接 `import { FORBIDDEN_LAYER_PAIRS } from '../../../backend-static/rules/dependencies.mjs'`，复用同一份禁止层对表，并加入了 entity 层识别、同模块限定，跟 `BE-DEP-C-001` 判定标准一致。⚠️ **循环依赖部分仍是独立实现**：用 Tarjan 算法（`findSccs`/`countCyclicEdges`）自己重新计算强连通分量，不读取 `BE-DEP-C-004` 的真实 finding，是与 dep-cruiser 平行的第二套环检测逻辑（但 SCC 归属判定已修复：只有两端落在同一个强连通分量的边才计入循环依赖，不再误判跨分量的桥接边） |
| **BE-DOM-M-001**<br>cross-module-deep-import-count | `implementations/backend/BE-DOM-M-001.mjs` | `count(边被 dep-cruiser 标记为 BE-DOM-C-001-no-cross-module-deep-import)` | 读 `depcruise-raw.json`，筛选 `dep.rules` 里名字等于 `BE-DOM-C-001-no-cross-module-deep-import` 的边（该规则在 `tool-configs/dep-cruiser.config.cjs` 里确有配置） | ✅ 一致：复用的是 dep-cruiser 侧配置的同名规则标记，但它与 constraint `BE-DOM-C-001`（backend-static 实现）是**两套独立引擎**在各自判定同一件事，只是恰好用了同一个规则名，理论上仍存在细微解析差异的风险（未实测发现具体反例） |
| **BE-ERR-M-001**<br>exception-unification-violation-density | `implementations/backend/BE-ERR-M-001.mjs` | `sum(weight_i × BE-ERR-C-00{1,2,3}的finding数) / max(1, service文件数)` | **真正复用** `constraintsLayer.findings_by_rule` 里 BE-ERR-C-001/002/003 已经算出来的 finding 数量（不是重新扫描）；分母遍历 `targetDir/src` 统计 `*.service.ts` 文件数 | ✅ 一致（10 条里唯一一条分子直接复用 constraint 结果的 metric，因此也是唯一放弃 `delta_vs_baseline` 的——`constraintsLayer` 只对 target 目录跑过，没有 baseline 版本可比） |
| **BE-CONTRACT-M-001**<br>dto-validator-coverage | `implementations/backend/BE-CONTRACT-M-001.mjs` → `backend-source-analysis.mjs::analyzeDtoValidatorCoverage()`（第219-277行） | `covered_fields / total_fields`（无字段记 1） | 独立扫描所有 `dto/*.ts` 目录下、类名以 `Dto` 结尾且不以 `ResponseDto` 结尾的类 | ⚠️ **口径更宽**：constraint `BE-CONTRACT-C-002` 只统计"确实被某个 controller 方法用 `@Body/@Query/@Param/@Headers` 引用"的 DTO；metric 统计的是**所有**符合命名规则的 DTO 文件，不要求被实际引用，分母可能包含从未被当作请求体使用过的 DTO 类 |
| **BE-TEST-M-001**<br>test-coverage | `adapters/test-coverage/adapter.mjs`（独立 adapter，非 computed-metrics） | `coverage-summary.json` 的 `total.lines.pct` | **真实执行**目标项目的测试命令（配置里是 `npm run test:cov -- --coverageReporters=json-summary`），是全部 30 条规则里唯一会跑被测项目本身测试套件的一条 | 不适用（无对应 constraint，衡量的是测试厚度而非架构一致性） |
| **BE-MOCK-M-001**<br>mock-per-test-case | `implementations/backend/BE-MOCK-M-001.mjs` → `backend-source-analysis.mjs::analyzeMockUsage()`（第573-630行） | `mocks / test_cases`（用例数为0记 `null`） | 扫描 `*.spec.ts`/`*.test.ts`，把 `it(`/`test(` 调用计为用例；mock 计数有两种方式：`jest.mock()`/`jest.spyOn()`调用，以及**任意方法调用**只要方法名是 `useValue`/`useFactory`/`useClass`（`isMockCounterCall()`，覆盖 `moduleRef.overrideProvider(X).useValue(Y)` 这类链式调用），加上对象字面量里直接出现的 `useValue`/`useFactory`/`useClass` 属性（`{ provide: X, useValue: Y }` 这类 NestJS 常见写法） | 启发式统计，无对应 constraint 可比对（`BE-TEST-C-001` 是二元判定"是否直接构造 repository"，这条 metric 是相关但非等价的代理信号）；属性名/方法名匹配不检查上下文，理论上任何跟 mock 无关但恰好用了这几个名字的代码也会被计入 |
| **BE-ROUTE-M-001**<br>route-prefix-violation-ratio | `implementations/backend/BE-ROUTE-M-001.mjs` → `backend-source-analysis.mjs::analyzeRoutes()`（第455-552行） | `violating_endpoints / total_endpoints` | 独立扫描，但前缀解析和 kebab-case 判定已与 constraint 共享逻辑（见下） | ✅ **已与 constraint 对齐**：全局前缀判断改用 `evaluateStatic()`（配合本文件内 `collectTopLevelBindings()` 收集同文件顶层常量绑定），能像 constraint 一样解析 `const API_PREFIX='api'; setGlobalPrefix(API_PREFIX)` 这种写法；kebab-case 校验直接 `import { isKebabRoute } from '../../../backend-static/rules/routes.mjs'`，跟 constraint 共用同一份实现（含版本号段、通配符段放行规则），不再是独立维护的第二份判定逻辑 |
| **BE-SIZE-M-001**<br>cyclomatic-complexity-ratio | `implementations/backend/BE-SIZE-M-001.mjs` → `backend-source-analysis.mjs::analyzeCyclomaticComplexity()`（第381-430行） | `violating_methods / total_methods`，`V(G) = 1 + count(if/while/for/case/&&/||/三元)`（`countDecisionPoints()`，第343行，遇到嵌套函数边界即停止下探，避免回调内部分支污染外层方法复杂度），阈值 `max_complexity`（默认10） | 独立扫描 `*.controller/.service/.repository.ts`，排除构造函数 | **概念上已不对应同一件事**：constraint `BE-SIZE-C-001` 检测的仍是"方法参数个数是否超过3"，这条 metric 已经从"参数比例"改成"圈复杂度比例"（衡量方法内部分支路径复杂度），两者是"方法过大"这个问题的不同侧面，不再是同一指标的连续化版本。旧的参数比例逻辑（`analyzeMethodParameters()`，第284-323行）仍在文件里，但不再被任何规则引用 |
| **BE-DUP-M-001**<br>clone-ratio | `implementations/backend/BE-DUP-M-001.mjs` | `duplicated_lines_covered / total_token_bearing_production_lines` | 对生产 `.ts`/`.tsx` 文件做 token 归一化（标识符/字面量替换为占位符）+ 滑动窗口哈希分桶（默认50 token）+ 命中桶内种子扩展找最大重复片段（≥5行或≥50token 任一满足），覆盖行用 `Set` 去重后计算比例 | 无对应单一 constraint（填补 `BE-DUP-C-001/002/003` 三条 duplication 分类此前零指标覆盖的空白，衡量的是通用 Type-1/Type-2 代码克隆，检测范围比这三条各自的窄判定条件更宽） |

**小结**：`BE-ERR-M-001`（直接复用 constraint finding 数）、`BE-DOM-M-001`（复用 dep-cruiser 同名规则标记）、
`BE-DEP-M-001`（分层部分复用 constraint 的判定常量）、`BE-ROUTE-M-001`（前缀解析与 kebab 校验都已复用
constraint 逻辑）四条已经不同程度地跟对应 constraint 共享判定依据，是"metric 应尽量复用 constraint 结果"
这个设计原则里做得比较到位的部分；`BE-STRUCT-M-001`、`BE-CONTRACT-M-001` 仍是完全独立的第二套实现，
口径已知比对应 constraint 更宽/更松；`BE-SIZE-M-001` 是刻意的概念替换（不再是同一件事的连续化版本）；
`BE-DUP-M-001` 是全新填补空白的独立实现。

**测试文件清单**（均在 `harness/core/tests/`，每个文件独立可跑：`node --test core/tests/<file>`）：

| Metric | 测试文件 | 用例数 |
|---|---|---|
| BE-STRUCT-M-001 | `backend-struct-metric.test.mjs` | 7 |
| BE-DEP-M-001 | `backend-dep-metric.test.mjs` | 6 |
| BE-DOM-M-001 | `backend-dom-metric.test.mjs` | 7 |
| BE-ERR-M-001 | `backend-err-metric.test.mjs` | 5 |
| BE-CONTRACT-M-001 | `backend-contract-metric.test.mjs` | 7 |
| BE-TEST-M-001 | `backend-coverage-metric.test.mjs`（真实 spawn 子进程，用确定性的内联脚本代替真实测试命令，避免 flaky） | 5 |
| BE-MOCK-M-001 | `backend-mock-metric.test.mjs` | 5 |
| BE-ROUTE-M-001 | `backend-route-metric.test.mjs` | 7 |
| BE-SIZE-M-001 | `backend-size-metric.test.mjs` | 8 |
| BE-DUP-M-001 | `backend-dup-metric.test.mjs` | 6 |

实测：`npm test` 全量 **240/240 通过**（含以上 10 个 metric 测试文件共 63 条用例，加上 20 条 constraint 的
83 条断言，以及 frontend/cross 相关的测试）。

---

## 4. 规则 YAML 与实现的一致性

metric 的调度只看 YAML 的 `adapter`/`implementation` 字段，`core/layers/metrics_runner.mjs` 从不读取
metric YAML 里的 `evidence_sources` 块——因此这里记录的都是"会不会误导只读 YAML 不读代码的人"，不影响
规则本身是否生效。

1. **`BE-DEP-M-001-dependency-violation-density.yaml`**：原先的 `evidence_sources` 块写着
   `adapter: dep-cruiser`、`tool_rule_ids: [no-orphans, no-circular]`，引用的是从未在
   `tool-configs/dep-cruiser.config.cjs` 里配置过的规则名，且这条路径从未被实际调度逻辑读取过。
   已删除该 `evidence_sources` 块，改成 `methodological_note` 如实描述真实数据来源（分层违规部分直接
   import constraint 的 `FORBIDDEN_LAYER_PAIRS` 常量，循环依赖部分独立跑 Tarjan 算法），并补全了此前
   留空的 `research_tags`。
2. **`BE-DOM-M-001-cross-module-deep-import-count.yaml`**：只有 `methodological_note` 里的散文描述
   （"复用 dep-cruiser 里 BE-DOM-C-001 标记的边"），没有独立的 `evidence_sources` 结构化字段——跟其它
   metric YAML 的字段风格不一致，但描述本身准确，不算错误，未改动。
3. **`BE-STRUCT-M-001-module-composition-violation-ratio.yaml`**：原先的 `description`/
   `methodological_note` 声称"repository 可选，与 C-001 保持一致"，但 C-001 从不把 repository 设为
   可选，metric 是否要求 repository 取决于是否存在 `*.entity.ts`，跟"与 C-001 保持一致"是两回事。
   已重写 `description`/`agent_facing_message`/`methodological_note`，如实描述当前的文件系统启发式
   判定逻辑，并明确注明这条 metric 的必需层判定独立于且窄于 `BE-STRUCT-C-001`（不检查 `@Module`
   登记），不应被当作后者的连续化版本来解读。**注意**：这次只修正了 YAML 文档描述，`.mjs` 实现本身的
   判定逻辑未改动，第 3 节表格里记录的口径差异依然存在。

---

## 5. 总体可信度结论

- **20 条 constraint 规则**：实现逻辑集中在 `adapters/backend-static/rules/` 下按分类拆分的文件里
  （或对应的外部工具真实执行），每条规则都有 positive/negative/nearMiss/ignored 四类 fixture，
  **83 条断言全部实测通过**，可信度有直接证据支撑。
- **10 条 metric 规则**：均有实现，且**全部 10 条都有专门的正确性单元测试**（合成项目 + 精确数值断言，
  共 63 条用例，见第 3 节末尾清单），公式本身、分母口径、边界条件都有直接测试证据，不再需要仅靠跟
  constraint 的口径比对来做间接验证。但测试能验证的是"代码当前的行为符合预期"，验证不了"这个行为是不是
  该有的正确定义"——逐条比对对应 constraint 后，`BE-STRUCT-M-001`、`BE-CONTRACT-M-001` 两条口径明确比其
  对应 constraint 更宽，`BE-DOM-M-001` 存在理论上的双引擎解析差异风险（未实测出具体反例）。`BE-DEP-M-001`、
  `BE-ROUTE-M-001` 已修复为与对应 constraint 共享判定依据，`BE-ERR-M-001` 直接复用 constraint 结果。
  如果研究结论依赖
  仍存在口径差异的这几条 metric 的绝对数值或跨样本比较，建议在解读时明确说明其分子/分母口径与同名
  constraint 不完全等价，或补充与对应 constraint 相同基准的单元测试。
- 本次审计未涉及 frontend / cross 规则包，也未评估 `core/aggregators`、`core/comparison` 等聚合与快照
  比较层的正确性。
