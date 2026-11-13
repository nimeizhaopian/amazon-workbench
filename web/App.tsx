import { ProductArt, Badge, Empty, SalesChart } from './components';
import { useCallback, useEffect, useState, useRef } from 'react';
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Bell,
  Bird,
  Bot,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Globe2,
  LayoutDashboard,
  ListChecks,
  LoaderCircle,
  Package,
  PlugZap,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  TrendingUp,
  TriangleAlert,
  X,
  Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { api } from './api';
import type { Connector, Draft, Page, Product, Snapshot, Store, Task } from './types';
const navigation: { id: Page; label: string; icon: LucideIcon }[] = [
  { id: 'overview', label: '运营概览', icon: LayoutDashboard },
  { id: 'products', label: '商品与库存', icon: Package },
  { id: 'tasks', label: '任务中心', icon: ListChecks },
  { id: 'assistant', label: '智能助手', icon: Sparkles },
  { id: 'connectors', label: '连接器', icon: PlugZap },
];
const templates = [
  {
    id: 'inventory_daily',
    title: '库存运营日报',
    description: '看清库存现状，发现潜在缺货',
    icon: FileText,
    tone: 'green',
  },
  {
    id: 'listing_audit',
    title: 'Listing 基础检查',
    description: '检查商品信息，整理优化方向',
    icon: ShoppingBag,
    tone: 'blue',
  },
  {
    id: 'replenishment',
    title: '补货建议',
    description: '按近期销量，评估补货缺口',
    icon: Package,
    tone: 'orange',
  },
];
const promptFor = (storeId: string) =>
  '请先使用 aw_inventory 查看店铺 ' +
  storeId +
  ' 的库存，识别需要关注的商品，然后用 aw_create_report 生成 inventory_daily 日报。请保留数据来源标记，不补造缺失销量。';
export default function App() {
  const [page, setPage] = useState<Page>('overview');
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState('');
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [toastError, setToastError] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [newTask, setNewTask] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState('inventory_daily');
  const [busy, setBusy] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [selectedConnector, setSelectedConnector] = useState<Connector | null>(null);
  const [runtime, setRuntime] = useState({ ready: false, enabled: true, url: '/harness/' });
  const [checking, setChecking] = useState('');
  // 手动刷新返回时可能已经切换店铺，只允许当前选择的响应更新视图。
  const storeRef = useRef(storeId);
  storeRef.current = storeId;
  const store = stores.find((s) => s.id === storeId);
  const currentPage = navigation.find((n) => n.id === page)!;
  useEffect(() => {
    Promise.all([api<Store[]>('/stores'), api<Connector[]>('/connectors')])
      .then(([s, c]) => {
        setStores(s);
        setStoreId(s[0]?.id || '');
        setConnectors(c);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, []);
  const refresh = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    setError('');
    try {
      const [s, t, d] = await Promise.all([
        api<Snapshot>('/snapshot?storeId=' + storeId),
        api<Task[]>('/tasks?storeId=' + storeId),
        api<Draft[]>('/drafts?storeId=' + storeId),
      ]);
      if (storeRef.current === storeId) {
        setSnapshot(s);
        setTasks(t);
        setDrafts(d);
      }
    } catch (e) {
      if (storeRef.current === storeId) {
        setError((e as Error).message);
        setSnapshot(null);
      }
    } finally {
      if (storeRef.current === storeId) setLoading(false);
    }
  }, [storeId]);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setSnapshot(null);
    setTasks([]);
    setDrafts([]);
    setSelectedProduct(null);
    setSelectedTask(null);
    setError('');
    if (!storeId) return;
    Promise.all([
      api<Snapshot>('/snapshot?storeId=' + storeId),
      api<Task[]>('/tasks?storeId=' + storeId),
      api<Draft[]>('/drafts?storeId=' + storeId),
    ])
      .then(([s, t, d]) => {
        if (!cancelled) {
          setSnapshot(s);
          setTasks(t);
          setDrafts(d);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [storeId]);
  useEffect(() => {
    if (!storeId) return;
    let cancelled = false;
    const poll = () =>
      api<Task[]>('/tasks?storeId=' + storeId)
        .then((data) => {
          if (cancelled) return;
          setTasks(data);
          setSelectedTask((old) => (old ? data.find((t) => t.id === old.id) || old : null));
        })
        .catch(() => {});
    const interval = setInterval(poll, 2500);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [storeId]);
  useEffect(() => {
    let stopped = false;
    const update = () =>
      api<{ ready: boolean; enabled: boolean; url: string }>('/runtime')
        .then((data) => {
          if (!stopped) setRuntime(data);
        })
        .catch(() => {});
    void update();
    const timer = setInterval(update, 5000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(''), 4500);
    return () => clearTimeout(id);
  }, [toast]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSelectedProduct(null);
        setSelectedTask(null);
        setSelectedConnector(null);
        setNewTask(false);
      }
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, []);
  const notify = (text: string, isError = false) => {
    setToastError(isError);
    setToast(text);
  };
  const startTask = async () => {
    setBusy(true);
    try {
      const task = await api<Task>('/tasks', {
        method: 'POST',
        body: JSON.stringify({ storeId, type: selectedTemplate }),
      });
      setNewTask(false);
      setPage('tasks');
      setTasks(await api<Task[]>('/tasks?storeId=' + storeId));
      setSelectedTask(task);
      notify('任务已创建，结果将保存在任务中心');
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  };
  const saveDraft = async () => {
    if (!selectedProduct) return;
    setBusy(true);
    try {
      await api('/drafts', {
        method: 'POST',
        body: JSON.stringify({ storeId, sku: selectedProduct.sku, title: draftTitle }),
      });
      setDrafts(await api<Draft[]>('/drafts?storeId=' + storeId));
      notify('本地草稿已保存，尚未提交亚马逊');
      setSelectedProduct(null);
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  };
  const openProduct = (p: Product) => {
    setSelectedProduct(p);
    setDraftTitle(drafts.find((d) => d.sku === p.sku)?.title || p.title);
  };
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      notify('已复制');
    } catch {
      notify('复制失败，请手动选择文本', true);
    }
  };
  const testConnector = async (c: Connector) => {
    setChecking(c.id);
    try {
      const result = await api<{ message: string }>('/connectors/' + c.id + '/test', {
        method: 'POST',
        body: '{}',
      });
      notify(result.message);
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setChecking('');
    }
  };
  const products = (snapshot?.products || []).filter(
    (p) =>
      (filter === 'all' ||
        (filter === 'risk' && ['critical', 'warning'].includes(p.severity)) ||
        (filter === 'drafts' && drafts.some((d) => d.sku === p.sku))) &&
      (!search ||
        [p.sku, p.asin, p.name, p.title].some((v) =>
          v.toLowerCase().includes(search.toLowerCase()),
        )),
  );
  const openTemplate = (id: string) => {
    setSelectedTemplate(id);
    setNewTask(true);
  };
  const taskRows = (data: Task[]) =>
    data.map((t) => (
      <button key={t.id} className="task-row" onClick={() => setSelectedTask(t)}>
        <span className={'task-icon ' + (t.status === 'failed' ? 'red' : 'green')}>
          <FileText size={19} />
        </span>
        <span className="task-row-main">
          <strong>{t.title}</strong>
          <small>
            {t.createdLabel} · {t.source === 'demo' ? '演示数据' : '真实数据'}
          </small>
        </span>
        <Badge tone={t.status === 'completed' ? 'green' : t.status === 'failed' ? 'red' : 'blue'}>
          {t.status === 'running' && <LoaderCircle size={12} className="spin" />}
          {t.statusLabel}
        </Badge>
        <ChevronRight size={15} className="muted" />
      </button>
    ));
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setPage('overview');
          }}
        >
          <span className="brand-mark">
            a<span>↗</span>
          </span>
          <div>
            <strong>
              AW<span className="brand-dot">.</span>
            </strong>
            <small>AMAZON WORKBENCH</small>
          </div>
        </a>
        <div className="workspace-switch">
          <span className="workspace-icon">
            <Globe2 size={17} />
          </span>
          <div>
            <strong>我的运营空间</strong>
            <small>本地工作台</small>
          </div>
          <ChevronDown size={14} />
        </div>
        <div className="nav-label">工作空间</div>
        <nav aria-label="主导航">
          {navigation.map((n) => (
            <button
              key={n.id}
              className={'nav-item ' + (page === n.id ? 'active' : '')}
              onClick={() => setPage(n.id)}
            >
              <n.icon size={18} />
              <span>{n.label}</span>
              {n.id === 'assistant' && <span className="nav-ai">AI</span>}
              {n.id === 'tasks' && tasks.length > 0 && (
                <span className="nav-count">{tasks.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="engine-status">
            <span className={'status-dot ' + (runtime.ready ? 'online' : '')} />
            <div>
              <strong>DeepSeek Harness</strong>
              <small>
                {runtime.ready ? '运行时已就绪' : runtime.enabled ? '运行时启动中' : '运行时未启用'}
              </small>
            </div>
            <Activity size={15} />
          </div>
          <button className="sidebar-user" onClick={() => setPage('connectors')}>
            <span className="avatar">AW</span>
            <div>
              <strong>运营工作台</strong>
              <small>本地 · 数据保存在本机</small>
            </div>
            <Settings2 size={16} />
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            工作空间 <ChevronRight size={13} />
            <span>{currentPage.label}</span>
          </div>
          <div className="topbar-right">
            <div className="global-search">
              <Search size={15} />
              <input
                aria-label="搜索商品或 SKU"
                placeholder="搜索商品、SKU…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') setPage('products');
                }}
              />
              <kbd>↵</kbd>
            </div>
            <span className={'source-indicator ' + (store?.source === 'amazon' ? 'live' : '')}>
              <span />
              {store?.source === 'amazon' ? '真实店铺' : '演示模式'}
            </span>
            <button
              aria-label="查看库存提醒"
              className="icon-button notification"
              onClick={() => {
                setFilter('risk');
                setPage('products');
              }}
            >
              <Bell size={19} />
              {!!snapshot?.alerts.length && <i />}
            </button>
            <span className="avatar small">AW</span>
          </div>
        </header>
        <main className={page === 'assistant' ? 'main-content assistant-main' : 'main-content'}>
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {page === 'overview'
                  ? 'YOUR DAILY OPERATIONS'
                  : page === 'products'
                    ? 'PRODUCTS & INVENTORY'
                    : page === 'tasks'
                      ? 'TASK CENTER'
                      : page === 'assistant'
                        ? 'POWERED BY DEEPSEEK'
                        : 'CONNECTIONS'}
              </div>
              <h1>{currentPage.label}</h1>
              <p>
                {page === 'overview'
                  ? '了解店铺表现，让每一步运营更有把握。'
                  : page === 'products'
                    ? '关注每个 SKU 的状态，把库存风险提前看见。'
                    : page === 'tasks'
                      ? '每次执行都有记录，每份结果都可以追溯。'
                      : page === 'assistant'
                        ? '让助手调用店铺工具，结果同步回到工作台。'
                        : '连接你的店铺、模型和浏览器。'}
              </p>
            </div>
            <div className="heading-actions">
              {page !== 'connectors' && page !== 'assistant' && (
                <div className="store-select">
                  <Globe2 size={15} />
                  <select
                    aria-label="选择店铺"
                    value={storeId}
                    onChange={(e) => setStoreId(e.target.value)}
                  >
                    {stores.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                        {s.source === 'demo' ? ' · 演示' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {page !== 'assistant' && page !== 'connectors' && (
                <button
                  className="button primary"
                  onClick={() => openTemplate('inventory_daily')}
                  disabled={!storeId}
                >
                  <Plus size={16} />
                  新建任务
                </button>
              )}
            </div>
          </div>
          {error && page !== 'connectors' && page !== 'assistant' && (
            <div className="error-panel" role="alert">
              <TriangleAlert size={20} />
              <div>
                <strong>数据读取失败</strong>
                <p>{error}</p>
              </div>
              <button className="button" onClick={() => void refresh()}>
                重试
              </button>
            </div>
          )}
          {loading && page !== 'connectors' && page !== 'assistant' ? (
            <div className="loading">
              <LoaderCircle className="spin" size={25} />
              <span>正在读取店铺数据…</span>
            </div>
          ) : (
            <>
              {page === 'overview' && snapshot && (
                <>
                  <section className="welcome-banner">
                    <div className="banner-text">
                      <div className="banner-kicker">
                        <span className="live-dot" />
                        你的每日运营起点
                      </div>
                      <h2>把店铺状态，变成下一步行动。</h2>
                      <p>
                        {snapshot.alerts.length
                          ? '有 ' +
                            snapshot.alerts.length +
                            ' 个 SKU 值得优先关注。生成一份日报，从重要的事开始。'
                          : '库存与商品尽在掌握，生成一份日报开始今天的工作。'}
                      </p>
                      <button onClick={() => openTemplate('inventory_daily')}>
                        生成运营日报 <ArrowRight size={16} />
                      </button>
                    </div>
                    <div className="banner-art" aria-hidden="true">
                      <div className="orbit orbit-one" />
                      <div className="orbit orbit-two" />
                      <div className="floating-chip">
                        <CheckCircle2 size={15} />
                        井然有序，稳步增长
                      </div>
                      <div className="mini-chart">
                        <span />
                        <span />
                        <span />
                        <span />
                        <span />
                        <TrendingUp size={58} />
                      </div>
                      <div className="banner-star">✦</div>
                    </div>
                  </section>
                  <section className="metrics-grid">
                    {[
                      {
                        label: '近 7 日销售额',
                        value: snapshot.metrics.revenue,
                        icon: TrendingUp,
                        foot: snapshot.source === 'demo' ? '演示销售数据' : '销量接口待接入',
                        tone: 'green',
                      },
                      {
                        label: '近 7 日订单',
                        value: snapshot.metrics.orders,
                        icon: ShoppingBag,
                        foot: snapshot.source === 'demo' ? '演示订单数量' : '订单接口待接入',
                        tone: 'blue',
                      },
                      {
                        label: 'FBA 可售库存',
                        value: snapshot.metrics.inventory,
                        icon: Package,
                        foot: snapshot.metrics.sku + ' 个 SKU · ' + snapshot.store.code,
                        tone: 'green',
                      },
                      {
                        label: '需要关注的 SKU',
                        value: snapshot.metrics.risk,
                        icon: TriangleAlert,
                        foot: '按可售库存与销量规则检查',
                        tone: 'orange',
                      },
                    ].map((m) => (
                      <article className="metric-card" key={m.label}>
                        <div className="metric-top">
                          <span>{m.label}</span>
                          <span className={'metric-icon ' + m.tone}>
                            <m.icon size={17} />
                          </span>
                        </div>
                        <strong className="metric-value">{m.value}</strong>
                        <div className="metric-footer">
                          <span className={'tiny-dot ' + m.tone} />
                          {m.foot}
                        </div>
                      </article>
                    ))}
                  </section>
                  <div className="overview-grid">
                    <section className="panel sales-panel">
                      <div className="panel-heading">
                        <div>
                          <h2>
                            销售趋势{' '}
                            <span className="subtle-tag">
                              {snapshot.source === 'demo' ? '演示' : '待接入'}
                            </span>
                          </h2>
                          <p>近 7 日销售表现</p>
                        </div>
                        <div className="chart-legend">
                          <span>
                            <i />
                            本期
                          </span>
                          <span>
                            <i />
                            参考期
                          </span>
                        </div>
                      </div>
                      <SalesChart data={snapshot.chart} />
                    </section>
                    <section className="panel attention-panel">
                      <div className="panel-heading">
                        <h2>
                          待关注事项 <span className="count-label">{snapshot.alerts.length}</span>
                        </h2>
                        <button
                          className="text-button"
                          onClick={() => {
                            setFilter('risk');
                            setPage('products');
                          }}
                        >
                          查看全部 <ArrowUpRight size={14} />
                        </button>
                      </div>
                      {snapshot.alerts.length ? (
                        snapshot.alerts.slice(0, 3).map((a) => (
                          <button
                            className="attention-row"
                            key={a.sku}
                            onClick={() =>
                              openProduct(snapshot.products.find((p) => p.sku === a.sku)!)
                            }
                          >
                            <span className="attention-icon">
                              <TriangleAlert size={15} />
                            </span>
                            <div>
                              <strong>{a.name}</strong>
                              <p>{a.message}</p>
                            </div>
                            <ChevronRight size={15} />
                          </button>
                        ))
                      ) : (
                        <Empty title="暂无库存提醒" text="当前库存规则未发现需要优先处理的商品。" />
                      )}
                      <div className="attention-foot">
                        <ShieldCheck size={13} />
                        数据更新于 {snapshot.collectedLabel}
                      </div>
                    </section>
                  </div>
                  <div className="section-heading">
                    <div>
                      <h2>常用工作流</h2>
                      <p>从一个具体任务开始，让运营更轻松。</p>
                    </div>
                    <Badge>规则分析 · 本地执行</Badge>
                  </div>
                  <section className="workflow-grid">
                    {templates.map((t) => (
                      <button
                        key={t.id}
                        className="workflow-card"
                        onClick={() => openTemplate(t.id)}
                      >
                        <div className={'workflow-icon ' + t.tone}>
                          <t.icon size={21} />
                        </div>
                        <div>
                          <h3>{t.title}</h3>
                          <p>{t.description}</p>
                        </div>
                        <ArrowUpRight size={17} />
                      </button>
                    ))}
                  </section>
                  <section className="panel recent-panel">
                    <div className="panel-heading">
                      <h2>最近任务</h2>
                      <button className="text-button" onClick={() => setPage('tasks')}>
                        全部任务 <ArrowRight size={14} />
                      </button>
                    </div>
                    {tasks.length ? (
                      taskRows(tasks.slice(0, 3))
                    ) : (
                      <div className="empty-inline">
                        <FileText size={18} />
                        <span>还没有执行记录，试着生成第一份运营日报。</span>
                        <button
                          className="text-button"
                          onClick={() => openTemplate('inventory_daily')}
                        >
                          创建任务 <ArrowRight size={14} />
                        </button>
                      </div>
                    )}
                  </section>
                  <div className="page-foot">
                    <span className="tiny-dot green" />
                    {snapshot.sourceLabel} ·{' '}
                    {snapshot.source === 'demo'
                      ? '所有商品、指标均为虚构示例'
                      : '已授权的 Amazon SP-API 数据'}
                    <span className="foot-right">以事实为基础，每一步有记录</span>
                  </div>
                </>
              )}
              {page === 'products' && snapshot && (
                <>
                  <div className="product-summary">
                    <span>
                      <Package size={17} />
                      <strong>{snapshot.metrics.sku}</strong> 个 SKU
                    </span>
                    <span>
                      <TriangleAlert size={17} />
                      <strong>{snapshot.metrics.risk}</strong> 项库存提醒
                    </span>
                    <span>
                      <FileText size={17} />
                      <strong>{drafts.length}</strong> 份本地草稿
                    </span>
                    <button className="text-button" onClick={() => void refresh()}>
                      <RefreshCw size={14} />
                      刷新数据
                    </button>
                  </div>
                  <section className="panel products-panel">
                    <div className="table-toolbar">
                      <div className="tabs">
                        {[
                          ['all', '全部商品'],
                          ['risk', '库存提醒'],
                          ['drafts', '本地草稿'],
                        ].map(([value, label]) => (
                          <button
                            key={value}
                            className={filter === value ? 'selected' : ''}
                            onClick={() => setFilter(value)}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                      <div className="table-search">
                        <Search size={15} />
                        <input
                          aria-label="筛选商品"
                          placeholder="搜索商品、ASIN 或 SKU"
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                        />
                        {search && (
                          <button aria-label="清空搜索" onClick={() => setSearch('')}>
                            <X size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>商品</th>
                            <th>价格</th>
                            <th>可售库存</th>
                            <th>近 7 日销量</th>
                            <th>库存覆盖</th>
                            <th>状态</th>
                            <th />
                          </tr>
                        </thead>
                        <tbody>
                          {products.map((p) => (
                            <tr key={p.sku}>
                              <td>
                                <button className="product-cell" onClick={() => openProduct(p)}>
                                  <ProductArt kind={p.kind} color={p.color} />
                                  <div>
                                    <strong>{p.name}</strong>
                                    <small>{p.sku}</small>
                                  </div>
                                </button>
                              </td>
                              <td className="tabular">{p.priceLabel}</td>
                              <td>
                                <strong className="tabular">{p.stockLabel}</strong>
                                <small className="cell-note">在途 {p.inboundLabel}</small>
                              </td>
                              <td className="tabular">{p.salesLabel}</td>
                              <td>
                                <span className={p.severity === 'critical' ? 'text-orange' : ''}>
                                  {p.coverageLabel}
                                </span>
                              </td>
                              <td>
                                <Badge
                                  tone={
                                    p.severity === 'healthy'
                                      ? 'green'
                                      : p.severity === 'unknown'
                                        ? 'neutral'
                                        : 'orange'
                                  }
                                >
                                  {p.status}
                                </Badge>
                                {drafts.some((d) => d.sku === p.sku) && (
                                  <small className="cell-note">有本地草稿</small>
                                )}
                              </td>
                              <td>
                                <button
                                  aria-label={'查看 ' + p.name}
                                  className="icon-button"
                                  onClick={() => openProduct(p)}
                                >
                                  <ArrowUpRight size={16} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {!products.length && (
                      <Empty title="没有匹配的商品" text="试着更换筛选条件或搜索关键词。" />
                    )}
                    <div className="table-foot">
                      共 {products.length} 个商品{' '}
                      <span>
                        {snapshot.sourceLabel} · {snapshot.collectedLabel} 更新
                      </span>
                    </div>
                  </section>
                </>
              )}
              {page === 'tasks' && (
                <>
                  <div className="task-stats">
                    {[
                      ['全部任务', tasks.length],
                      ['已完成', tasks.filter((t) => t.status === 'completed').length],
                      ['执行中', tasks.filter((t) => t.status === 'running').length],
                      ['执行失败', tasks.filter((t) => t.status === 'failed').length],
                    ].map(([label, value]) => (
                      <div key={label}>
                        <span>{label}</span>
                        <strong>{value}</strong>
                      </div>
                    ))}
                  </div>
                  <section className="panel">
                    <div className="panel-heading">
                      <h2>执行记录</h2>
                      <Badge>{store?.name}</Badge>
                    </div>
                    {tasks.length ? (
                      taskRows(tasks)
                    ) : (
                      <Empty
                        title="从第一份日报开始"
                        text="点击右上角“新建任务”，执行后可查看每一步进度与报告。"
                      />
                    )}
                  </section>
                </>
              )}
              {page === 'connectors' && (
                <>
                  <div className="connection-notice">
                    <ShieldCheck size={19} />
                    <div>
                      <strong>你的数据，由你连接</strong>
                      <p>凭据保存在本机。配置完成并通过验证后，再读取真实店铺数据。</p>
                    </div>
                    <Badge tone="green">本地工作空间</Badge>
                  </div>
                  <div className="connectors-grid">
                    {connectors.map((c) => (
                      <article className="connector-card" key={c.id}>
                        <div className="connector-card-top">
                          <div className={'connector-logo ' + c.id}>
                            {c.id === 'amazon' ? (
                              <span>
                                a<span>⌣</span>
                              </span>
                            ) : c.id === 'ziniao' ? (
                              <Bird size={27} />
                            ) : (
                              <Bot size={27} />
                            )}
                          </div>
                          <Badge
                            tone={
                              c.status === 'enabled'
                                ? 'green'
                                : c.status === 'reserved'
                                  ? 'purple'
                                  : 'neutral'
                            }
                          >
                            {c.statusLabel}
                          </Badge>
                        </div>
                        <h2>{c.name}</h2>
                        <div className="connector-subtitle">{c.subtitle}</div>
                        <p>{c.description}</p>
                        <div className="connector-features">
                          {(c.id === 'amazon'
                            ? ['FBA 库存读取', '逐店铺数据隔离']
                            : c.id === 'ziniao'
                              ? ['店铺浏览器操作', '默认关闭，按需启用']
                              : ['官方 Web UI', '亚马逊业务工具']
                          ).map((label) => (
                            <span key={label}>
                              <Check size={13} />
                              {label}
                            </span>
                          ))}
                        </div>
                        <div className="connector-buttons">
                          <button className="button" onClick={() => setSelectedConnector(c)}>
                            <Settings2 size={14} />
                            配置说明
                          </button>
                          <button
                            className="button subtle"
                            onClick={() =>
                              c.id === 'deepseek' ? setPage('assistant') : void testConnector(c)
                            }
                            disabled={checking === c.id}
                          >
                            {checking === c.id ? (
                              <LoaderCircle size={14} className="spin" />
                            ) : c.id === 'deepseek' ? (
                              <ArrowUpRight size={14} />
                            ) : (
                              <Activity size={14} />
                            )}{' '}
                            {c.id === 'deepseek' ? '打开助手' : '检测连接'}
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                  <section className="panel integration-notes">
                    <div className="panel-heading">
                      <h2>当前接入范围</h2>
                      <PlugZap size={18} />
                    </div>
                    <div>
                      <span className="note-number">01</span>
                      <p>
                        <strong>Amazon：FBA 库存读取</strong>销售额、逐 SKU
                        销量和广告数据将在后续连接对应接口。缺失数据保留为空。
                      </p>
                    </div>
                    <div>
                      <span className="note-number">02</span>
                      <p>
                        <strong>Listing：本地草稿</strong>
                        支持预览、编辑和保存修改；当前版本不会向店铺发布。
                      </p>
                    </div>
                    <div>
                      <span className="note-number">03</span>
                      <p>
                        <strong>紫鸟：社区 MCP 预留</strong>基于 ziniao-mcp 0.1.33，需紫鸟客户端与
                        WebDriver 权限；连接检测只枚举工具。
                      </p>
                    </div>
                  </section>
                </>
              )}
              {page === 'assistant' && (
                <>
                  <div className="assistant-context">
                    <span>
                      <span className={'status-dot ' + (runtime.ready ? 'online' : '')} />
                      {runtime.ready ? 'DeepSeek Harness 已就绪' : '等待 DSH 运行时'}
                    </span>
                    <button className="text-button" onClick={() => void copy(promptFor(storeId))}>
                      <Copy size={14} />
                      复制当前店铺日报指令
                    </button>
                    <a className="text-button" href={runtime.url} target="_blank" rel="noreferrer">
                      独立打开 <ExternalLink size={14} />
                    </a>
                  </div>
                  {runtime.ready ? (
                    <div className="harness-frame">
                      <iframe src={runtime.url} title="DeepSeek Harness 智能助手" />
                    </div>
                  ) : (
                    <div className="panel assistant-wait">
                      <div className="assistant-orb">
                        <Sparkles size={32} />
                      </div>
                      <h2>{runtime.enabled ? '运行时正在准备' : '运行时未开启'}</h2>
                      <p>
                        {runtime.enabled
                          ? '首次启动会初始化项目配置。就绪后这里将显示官方 DSH 界面。'
                          : '在 .env 中设置 DSH_ENABLED=true 后重新启动。'}
                      </p>
                      <div className="loading-inline">
                        <LoaderCircle size={16} className="spin" />
                        正在检查本地服务
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </main>
      </div>
      {toast && (
        <div className={'toast ' + (toastError ? 'toast-error' : '')} role="status">
          {toastError ? <TriangleAlert size={18} /> : <CheckCircle2 size={18} />}
          <span>{toast}</span>
          <button aria-label="关闭提示" onClick={() => setToast('')}>
            <X size={14} />
          </button>
        </div>
      )}
      {newTask && (
        <div className="modal-backdrop" onClick={() => !busy && setNewTask(false)}>
          <section
            className="modal task-modal"
            role="dialog"
            aria-modal="true"
            aria-label="新建运营任务"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-heading">
              <div>
                <span className="eyebrow">NEW TASK</span>
                <h2>开始一个运营任务</h2>
              </div>
              <button
                className="icon-button"
                aria-label="关闭新建任务"
                onClick={() => setNewTask(false)}
              >
                <X size={19} />
              </button>
            </div>
            <p className="modal-description">选择任务类型，结果将保存在当前店铺的任务记录中。</p>
            <div className="modal-store">
              <Globe2 size={18} />
              <strong>{store?.name}</strong>
              <Badge tone={store?.source === 'demo' ? 'orange' : 'green'}>
                {store?.source === 'demo' ? '演示数据' : '真实数据'}
              </Badge>
            </div>
            <div className="template-options">
              {templates.map((t) => (
                <button
                  className={'template-option ' + (selectedTemplate === t.id ? 'chosen' : '')}
                  key={t.id}
                  onClick={() => setSelectedTemplate(t.id)}
                >
                  <span className={'workflow-icon ' + t.tone}>
                    <t.icon size={21} />
                  </span>
                  <div>
                    <strong>{t.title}</strong>
                    <p>{t.description}</p>
                  </div>
                  <span className="radio-circle">{selectedTemplate === t.id && <span />}</span>
                </button>
              ))}
            </div>
            <div className="info-note">
              <ShieldCheck size={15} />
              本次执行生成规则报告，不会修改店铺。
              {store?.source === 'demo' ? '使用虚构演示数据。' : ''}
            </div>
            <div className="modal-actions">
              <button className="button" onClick={() => setNewTask(false)}>
                取消
              </button>
              <button className="button primary" disabled={busy} onClick={() => void startTask()}>
                {busy ? <LoaderCircle size={16} className="spin" /> : <Zap size={16} />}开始执行
              </button>
            </div>
          </section>
        </div>
      )}
      {selectedProduct && (
        <div className="modal-backdrop drawer-backdrop" onClick={() => setSelectedProduct(null)}>
          <section
            className="drawer"
            role="dialog"
            aria-modal="true"
            aria-label="商品详情与本地草稿"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="drawer-heading">
              <div>
                <span className="eyebrow">PRODUCT DETAILS</span>
                <h2>商品详情</h2>
              </div>
              <button
                className="icon-button"
                aria-label="关闭商品详情"
                onClick={() => setSelectedProduct(null)}
              >
                <X size={20} />
              </button>
            </div>
            <div className="drawer-body">
              <div className="detail-product">
                <ProductArt kind={selectedProduct.kind} color={selectedProduct.color} />
                <div>
                  <h3>{selectedProduct.name}</h3>
                  <p>{selectedProduct.sku}</p>
                  <Badge
                    tone={
                      selectedProduct.severity === 'healthy'
                        ? 'green'
                        : selectedProduct.severity === 'unknown'
                          ? 'neutral'
                          : 'orange'
                    }
                  >
                    {selectedProduct.status}
                  </Badge>
                </div>
              </div>
              <div className="detail-metrics">
                <div>
                  <span>可售库存</span>
                  <strong>{selectedProduct.stockLabel}</strong>
                </div>
                <div>
                  <span>近 7 日销量</span>
                  <strong>{selectedProduct.salesLabel}</strong>
                </div>
                <div>
                  <span>库存覆盖</span>
                  <strong>{selectedProduct.coverageLabel}</strong>
                </div>
              </div>
              <dl className="detail-list">
                <div>
                  <dt>ASIN</dt>
                  <dd>{selectedProduct.asin}</dd>
                </div>
                <div>
                  <dt>商品类目</dt>
                  <dd>{selectedProduct.category}</dd>
                </div>
                <div>
                  <dt>在途数量</dt>
                  <dd>{selectedProduct.inboundLabel} 件</dd>
                </div>
                <div>
                  <dt>数据来源</dt>
                  <dd>{snapshot?.sourceLabel}</dd>
                </div>
              </dl>
              <div className="draft-section">
                <div className="section-heading">
                  <h3>Listing 标题草稿</h3>
                  <Badge>仅本地</Badge>
                </div>
                <label>当前标题</label>
                <div className="original-title">{selectedProduct.title}</div>
                <label htmlFor="draft-title">修改后的标题</label>
                <textarea
                  id="draft-title"
                  value={draftTitle}
                  onChange={(e) => setDraftTitle(e.target.value)}
                  maxLength={500}
                  rows={5}
                />
                <div className="field-hint">
                  <span>依据商品已有事实编辑，避免添加未经验证的属性。</span>
                  <span>{draftTitle.length}/500</span>
                </div>
              </div>
              <div className="info-note">
                <ShieldCheck size={16} />
                草稿只保存到本地数据库，不会提交到 Amazon。
              </div>
            </div>
            <div className="drawer-footer">
              <button className="button" onClick={() => setSelectedProduct(null)}>
                关闭
              </button>
              <button
                className="button primary"
                disabled={busy || !draftTitle.trim()}
                onClick={() => void saveDraft()}
              >
                {busy ? <LoaderCircle size={15} className="spin" /> : <FileText size={15} />}
                保存本地草稿
              </button>
            </div>
          </section>
        </div>
      )}
      {selectedTask && (
        <div className="modal-backdrop" onClick={() => setSelectedTask(null)}>
          <section
            className="modal report-modal"
            role="dialog"
            aria-modal="true"
            aria-label="任务报告"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-heading">
              <div>
                <span className="eyebrow">TASK REPORT</span>
                <h2>{selectedTask.title}</h2>
              </div>
              <button
                className="icon-button"
                aria-label="关闭任务报告"
                onClick={() => setSelectedTask(null)}
              >
                <X size={19} />
              </button>
            </div>
            <div className="report-meta">
              <Badge
                tone={
                  selectedTask.status === 'completed'
                    ? 'green'
                    : selectedTask.status === 'failed'
                      ? 'red'
                      : 'blue'
                }
              >
                {selectedTask.statusLabel}
              </Badge>
              <span>{selectedTask.createdLabel}</span>
              <Badge tone={selectedTask.source === 'demo' ? 'orange' : 'green'}>
                {selectedTask.source === 'demo' ? '演示数据' : '真实数据'}
              </Badge>
            </div>
            <div className="task-steps">
              {selectedTask.steps.map((s, i) => (
                <div className={s.status} key={s.name}>
                  <span>
                    {s.status === 'completed' ? (
                      <Check size={13} />
                    ) : s.status === 'running' ? (
                      <LoaderCircle size={13} className="spin" />
                    ) : (
                      i + 1
                    )}
                  </span>
                  {s.name}
                </div>
              ))}
            </div>
            {selectedTask.error && (
              <div className="error-panel">
                <TriangleAlert size={20} />
                {selectedTask.error}
              </div>
            )}
            {selectedTask.report && (
              <>
                <div className="report-summary">
                  <h3>{selectedTask.report.summary}</h3>
                  <p>{selectedTask.report.notes}</p>
                  <small>{selectedTask.report.method}</small>
                </div>
                <div className="findings">
                  {selectedTask.report.findings.length ? (
                    selectedTask.report.findings.map((f, i) => (
                      <article key={f.sku}>
                        <span className="finding-index">{String(i + 1).padStart(2, '0')}</span>
                        <div>
                          <h4>{f.title}</h4>
                          <small>{f.sku}</small>
                          <p>{f.detail}</p>
                          <div className="finding-action">
                            <ArrowRight size={13} />
                            {f.action}
                          </div>
                        </div>
                      </article>
                    ))
                  ) : (
                    <Empty title="检查完成" text="本次可用数据与规则下，没有额外行动项。" />
                  )}
                </div>
              </>
            )}
            <div className="modal-actions">
              <button className="button" onClick={() => setSelectedTask(null)}>
                关闭
              </button>
              {selectedTask.report && (
                <a
                  className="button primary"
                  href={'/api/tasks/' + selectedTask.id + '/export?storeId=' + selectedTask.storeId}
                >
                  <Download size={15} />
                  导出 CSV
                </a>
              )}
            </div>
          </section>
        </div>
      )}
      {selectedConnector && (
        <div className="modal-backdrop drawer-backdrop" onClick={() => setSelectedConnector(null)}>
          <section
            className="drawer"
            role="dialog"
            aria-modal="true"
            aria-label="连接器配置"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="drawer-heading">
              <div>
                <span className="eyebrow">CONNECTOR SETUP</span>
                <h2>{selectedConnector.name}</h2>
              </div>
              <button
                className="icon-button"
                aria-label="关闭连接器配置"
                onClick={() => setSelectedConnector(null)}
              >
                <X size={20} />
              </button>
            </div>
            <div className="drawer-body">
              <Badge>{selectedConnector.statusLabel}</Badge>
              <p className="connector-intro">{selectedConnector.description}</p>
              {selectedConnector.id === 'deepseek' ? (
                <>
                  <div className="info-note">
                    进入智能助手，在官方 DSH 的模型设置中填写 API
                    Key。工作台不会读取或展示密钥内容。
                  </div>
                  <button
                    className="button primary"
                    onClick={() => {
                      setSelectedConnector(null);
                      setPage('assistant');
                    }}
                  >
                    打开智能助手 <ArrowRight size={15} />
                  </button>
                </>
              ) : (
                <>
                  <h3>本地环境配置</h3>
                  <p className="help-text">
                    将项目根目录的 .env.example 复制为 .env，填写下列字段，然后重新启动工作台。
                  </p>
                  <div className="config-fields">
                    {selectedConnector.fields.map((f) => (
                      <div key={f.key}>
                        <code>{f.key}</code>
                        <Badge tone={f.configured ? 'green' : 'neutral'}>
                          {f.configured ? '已填写' : '待填写'}
                        </Badge>
                      </div>
                    ))}
                  </div>
                  {selectedConnector.id === 'ziniao' && (
                    <>
                      <div className="code-block">
                        <code>
                          ZINIAO_ENABLED=true
                          <br />
                          ZINIAO_MCP_COMMAND=uvx
                          <br />
                          ZINIAO_MCP_ARGS=["ziniao-mcp==0.1.33"]
                          <br />
                          ZINIAO_VERSION=v6
                        </code>
                      </div>
                      <div className="info-note">
                        <Bird size={17} />
                        需要安装紫鸟客户端、uvx，并开通 WebDriver 权限。此 MCP
                        为社区项目，版本已固定。
                      </div>
                    </>
                  )}
                  {selectedConnector.id === 'amazon' && (
                    <div className="info-note">
                      <ShieldCheck size={17} />
                      需要 Amazon 私有 SP-API 应用及自授权 refresh token。当前接入范围为 FBA
                      库存读取。
                    </div>
                  )}
                  <button
                    className="button primary"
                    onClick={() => void testConnector(selectedConnector)}
                    disabled={checking === selectedConnector.id}
                  >
                    {checking === selectedConnector.id ? (
                      <LoaderCircle size={15} className="spin" />
                    ) : (
                      <Activity size={15} />
                    )}
                    检测连接
                  </button>
                </>
              )}
            </div>
            <div className="drawer-footer">
              <button className="button" onClick={() => setSelectedConnector(null)}>
                关闭
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
