# CSS 管理规范

本文档说明 baseline frontend 的样式架构、各类样式工具的职责，以及新增或修改样式时必须遵守的规则。

## 1. 核心原则

MUI Theme 是项目唯一的设计系统来源。

```text
MUI Theme
├── MUI 组件：theme、sx、styled()、component overrides
└── 非 MUI 复杂组件：Theme 导出的 --app-* CSS Variables → CSS Modules
```

项目不使用 Tailwind，也不维护独立的 CSS token 文件。颜色、字体、通用间距、圆角和阴影等设计值不能在业务代码中重新定义。

## 2. 样式目录与职责

### `src/themes/index.jsx`

负责构建和提供 MUI Theme，包括：

- light/dark color schemes
- palette 和 preset color
- typography
- spacing
- shape
- breakpoints
- transitions 和 z-index
- custom shadows
- component overrides

业务组件不应直接维护另一份上述设计值。

### `src/themes/overrides/`

负责 MUI 组件的全局默认外观。多个页面或组件需要相同的 MUI 样式时，应优先在这里定义，而不是重复编写 `sx`。

`CssBaseline.js` 还负责：

- `html`、`body` 和 `#root` 的基础样式
- 全局 `box-sizing`
- `focus-visible`
- 向 CSS Modules 暴露 `--app-*` 变量

### `src/themes/cssVariables.js`

这是 Theme 到普通 CSS 的桥接层。它只把当前 Theme 的值转换成稳定的 `--app-*` 变量，不是第二套 token 来源。

例如：

```text
theme.vars.palette.text.secondary
                ↓
--app-color-text-muted
                ↓
Component.module.scss
```

### `*.module.css` / `*.module.scss`

CSS Modules 只用于非 MUI 的复杂 DOM 结构，例如复杂工具栏、编辑器、图表容器或第三方组件包装层。

CSS Module 必须与对应组件放在同一目录，并通过 `styles.xxx` 使用：

```jsx
import styles from './Toolbar.module.scss';

export function Toolbar() {
  return <div className={styles.root} />;
}
```

### 第三方 CSS

依赖包要求的全局 CSS 可以在 `src/index.jsx` 中直接导入，例如：

```js
import 'simplebar-react/dist/simplebar.min.css';
```

如果必须维护本地第三方覆盖文件，应放在 `src/assets/third-party/`。第三方文件不能成为业务组件全局样式的存放位置。

## 3. 样式方式的选择顺序

### MUI component overrides

适合影响全项目同类 MUI 组件的规则：

```js
export default function TableContainer() {
  return {
    MuiTableContainer: {
      styleOverrides: {
        root: { borderRadius: 0 }
      }
    }
  };
}
```

### `styled()`

适合可复用组件、复杂状态、伪元素和多个子选择器：

```jsx
const NavigationItem = styled(ListItemButton)(({ theme }) => ({
  borderRadius: theme.shape.borderRadius,
  '&:hover': {
    backgroundColor: theme.vars.palette.primary.lighter
  }
}));
```

### `sx`

适合单个 MUI 组件上的局部布局和少量样式：

```jsx
<Stack
  direction={{ xs: 'column', sm: 'row' }}
  sx={{ gap: 2, color: 'text.secondary' }}
/>
```

`sx` 中应优先使用 Theme 语义值：

```jsx
// 正确
sx={{ p: 2, color: 'text.secondary', borderColor: 'divider' }}

// 不正确
sx={{ padding: '16px', color: '#595959', borderColor: '#d9d9d9' }}
```

### CSS Modules

适合非 MUI 的复杂结构：

```scss
.toolbar {
  display: flex;
  gap: var(--app-space-4);
  color: var(--app-color-text-muted);
  border-color: var(--app-color-border);
}
```

## 4. CSS Variables

当前公开变量由 `src/themes/cssVariables.js` 统一维护。

### 颜色

```text
--app-color-primary
--app-color-primary-contrast
--app-color-text-primary
--app-color-text-muted
--app-color-surface
--app-color-background
--app-color-border
--app-color-focus-ring
```

### 字体

```text
--app-font-family
--app-font-size-logo
--app-font-weight-bold
```

### 间距

```text
--app-space-1
--app-space-2
--app-space-3
--app-space-4
```

### 圆角与阴影

```text
--app-radius-sm
--app-radius-md
--app-shadow-z1
```

只有存在明确复用需求时才新增变量。新增变量必须从 `theme` 或 `theme.vars` 派生，不能在 `cssVariables.js` 中建立一套与 Theme 无关的颜色或尺寸系统。

## 5. 哪些值必须来自 Theme

以下设计值必须使用 Theme API 或 `--app-*`：

- 颜色
- 通用间距
- 通用字号和字重
- 通用圆角
- 通用阴影
- z-index
- 动画时长与 easing
- 响应式断点

以下结构性 CSS 不需要变量化：

```scss
display: flex;
flex-direction: column;
width: 100%;
overflow: hidden;
grid-template-columns: 1fr auto;
```

组件独有的几何约束可以保留局部值，例如编辑区域最大宽度、图标 viewBox 尺寸或数据表格列宽。不要为了消除所有数字而创建缺少语义的变量。

## 6. 响应式样式

响应式布局优先使用 MUI breakpoint API：

```jsx
sx={{
  display: { xs: 'none', lg: 'block' },
  width: { xs: '100%', md: 420 }
}}
```

CSS Variables 不能可靠地用于媒体查询条件，因此 CSS Module 必须使用媒体查询时，可以写与 Theme 相同的固定断点，并标明来源：

```scss
/* Matches theme.breakpoints.values.sm. */
@media (min-width: 768px) {
  /* ... */
}
```

如果一个 CSS Module 出现大量响应式规则，应把响应式外层布局改为 MUI `Box`、`Stack` 或 `Grid`。

## 7. 禁止事项

项目中禁止：

- Tailwind 依赖、配置、`@tailwind` 指令和 utility class
- 独立的 `tokens.css`
- 页面或业务组件级全局 class
- 使用普通 CSS 覆盖 `.Mui*` 内部 class
- 同一个属性同时由 `className`、`sx` 和 `style` 控制
- 无说明的 JSX `style` 属性
- 业务代码中的硬编码主题颜色
- 使用 `!important` 解决普通样式优先级问题
- 在多个组件中复制相同的大型 `sx` 对象

以下情况可以使用有说明的 inline style：

- 第三方 API 只接受 `style`
- 拖拽、虚拟列表等高频动态几何值
- 只向 CSS 传递运行时 custom property

例如：

```jsx
{/* Runtime value consumed by the component CSS Module. */}
<div style={{ '--progress': `${progress}%` }} />
```

## 8. 修改样式时的检查清单

提交前确认：

1. 这是全局 MUI 行为、可复用组件样式、局部 MUI 样式，还是复杂非 MUI 样式？
2. 是否选择了对应的 override、`styled()`、`sx` 或 CSS Module？
3. 颜色、间距、字体、圆角和阴影是否来自 Theme？
4. 是否重复实现了 Theme 中已有的 token？
5. 是否出现新的全局业务 class、`!important` 或 JSX `style`？
6. light/dark 模式下是否都正确？
7. preset color 切换后，CSS Module 是否随 Theme 一起更新？
8. `pnpm check` 是否通过？该命令依次执行 CSS 架构检查、lint、test 和 build。

`pnpm check:css` 会自动阻止：

- Tailwind 配置或依赖重新出现
- 在业务源码中新增非 Module 全局样式文件
- CSS Modules 使用硬编码颜色或旧 CSS token
- CSS Modules 使用 `!important`
- CSS Modules 直接覆盖 `.Mui*` class
