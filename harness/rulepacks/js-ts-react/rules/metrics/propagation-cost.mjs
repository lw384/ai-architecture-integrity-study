export async function run(baseline, target) {
    const calc = (data) => {
        // 这里放入 Li et al. (2014) 的算法实现
        // 使用 dep-cruiser 的 JSON 数据结构 (data.modules)
        return /* 标量值 */;
    };

    const bValue = calc(baseline);
    const tValue = calc(target);

    return {
        value: tValue,
        delta: tValue - bValue,
        percentage_change: bValue === 0 ? 0 : (tValue - bValue) / bValue
    };
}