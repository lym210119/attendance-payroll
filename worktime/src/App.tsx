import { useMemo, useState } from 'react';
import { calculateAttendance } from './domain/attendance-engine';

type Page = 'overview' | 'attendance' | 'employees' | 'payroll' | 'reports';
type Staff = { id: number; name: string; team: string; state: '正常' | '迟到' | '缺卡'; time: string };
const nav: { key: Page; label: string; icon: string }[] = [
  { key: 'overview', label: '工作台', icon: '◫' },
  { key: 'attendance', label: '考勤管理', icon: '◷' },
  { key: 'employees', label: '员工管理', icon: '♙' },
  { key: 'payroll', label: '工资管理', icon: '￥' },
  { key: 'reports', label: '报表中心', icon: '▤' },
];
const initialStaff: Staff[] = [
  { id: 1, name: '林晓', team: '运营部', state: '正常', time: '08:56' },
  { id: 2, name: '周明', team: '仓储部', state: '迟到', time: '09:18' },
  { id: 3, name: '陈佳', team: '门店一组', state: '正常', time: '08:47' },
  { id: 4, name: '王浩', team: '仓储部', state: '缺卡', time: '—' },
  { id: 5, name: '李婷', team: '运营部', state: '正常', time: '08:59' },
  { id: 6, name: '赵磊', team: '门店一组', state: '正常', time: '08:52' },
];
const money = (value: number) => new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY', maximumFractionDigits: 2 }).format(value);
export default function App() {
  const [active, setActive] = useState<Page>('overview');
  const [staff, setStaff] = useState(initialStaff);
  const [punched, setPunched] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('全部');
  const [newName, setNewName] = useState('');
  const [newTeam, setNewTeam] = useState('运营部');
  const [showAdd, setShowAdd] = useState(false);
  const [salary, setSalary] = useState('6500');
  const [days, setDays] = useState('22');
  const [overtime, setOvertime] = useState('8');
  const [calculated, setCalculated] = useState(false);
  const [shiftStart, setShiftStart] = useState('08:00');
  const [shiftEnd, setShiftEnd] = useState('20:00');
  const [punchInTime, setPunchInTime] = useState('08:05');
  const [punchOutTime, setPunchOutTime] = useState('20:30');
  const [includePunchIn, setIncludePunchIn] = useState(true);
  const [includePunchOut, setIncludePunchOut] = useState(true);
  const [approveOvertime, setApproveOvertime] = useState(false);
  const [breakStart, setBreakStart] = useState('12:00');
  const [breakEnd, setBreakEnd] = useState('13:30');
  const demoDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date());
  const attendanceCalculation = useMemo(() => {
    try {
      const stamp = (time: string, dayOffset = 0) => {
        const [year, month, day] = demoDay.split('-').map(Number);
        const target = new Date(Date.UTC(year, month - 1, day + dayOffset));
        const date = [target.getUTCFullYear(), String(target.getUTCMonth() + 1).padStart(2, '0'), String(target.getUTCDate()).padStart(2, '0')].join('-');
        return new Date(`${date}T${time}:00+08:00`).toISOString();
      };
      const overnightShift = shiftEnd <= shiftStart;
      const breakDay = overnightShift && breakStart < shiftStart ? 1 : 0;
      const breakEndDay = breakDay + (breakEnd <= breakStart ? 1 : 0);
      const punchOutDay = punchOutTime <= punchInTime ? 1 : 0;
      const punches = [
        ...(includePunchIn ? [{ type: 'in' as const, at: stamp(punchInTime), evidenceId: 'demo-clock-in' }] : []),
        ...(includePunchOut ? [{ type: 'out' as const, at: stamp(punchOutTime, punchOutDay), evidenceId: 'demo-clock-out' }] : []),
      ];
      return { result: calculateAttendance({
        scheduledStart: stamp(shiftStart),
        scheduledEnd: stamp(shiftEnd, overnightShift ? 1 : 0),
        punches,
        breaks: [{ start: stamp(breakStart, breakDay), end: stamp(breakEnd, breakEndDay) }],
        approvedOvertime: approveOvertime,
        policy: { fullShiftUnpaidBreakMinutes: 90, requireOvertimeApproval: true },
      }), error: '' };
    } catch (error) {
      return { result: null, error: error instanceof Error ? error.message : '输入有误' };
    }
  }, [demoDay, shiftStart, shiftEnd, punchInTime, punchOutTime, includePunchIn, includePunchOut, approveOvertime, breakStart, breakEnd]);
  const pageTitle = nav.find(n => n.key === active)?.label ?? '工作台';
  const today = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }).format(new Date());
  const filteredStaff = useMemo(() => staff.filter(s => (s.name.includes(query.trim()) || s.team.includes(query.trim())) && (filter === '全部' || s.state === filter)), [staff, query, filter]);
  const attendanceCount = staff.filter(s => s.state !== '缺卡').length;
  const addEmployee = () => {
    const name = newName.trim();
    if (!name) return;
    setStaff(current => [...current, { id: Math.max(0, ...current.map(s => s.id)) + 1, name, team: newTeam, state: '缺卡', time: '—' }]);
    setNewName(''); setShowAdd(false);
  };
  const pay = Math.max(0, Number(salary) || 0) / 22 * Math.max(0, Number(days) || 0) + Math.max(0, Number(salary) || 0) / 174 * Math.max(0, Number(overtime) || 0) * 1.5;
  const statusClass = (state: Staff['state']) => state === '正常' ? 'status-ok' : state === '迟到' ? 'status-late' : 'status-missing';
  const staffTable = (rows: Staff[]) => <div className="table-wrap"><table><thead><tr><th>员工</th><th>部门</th><th>打卡时间</th><th>状态</th></tr></thead><tbody>{rows.map(s => <tr key={s.id}><td><div className="person"><span className="avatar">{s.name[0]}</span><b>{s.name}</b></div></td><td>{s.team}</td><td className="time-cell">{s.time}</td><td><span className={'status ' + statusClass(s.state)}>{s.state}</span></td></tr>)}</tbody></table>{rows.length === 0 && <div className="empty-state">没有符合条件的员工</div>}</div>;
  return <div className="app-shell">
    <aside className="sidebar"><div className="brand"><div className="brand-mark">◷</div><div><strong>工时云</strong><small>WORKTIME</small></div></div><div className="workspace"><span className="workspace-dot"/>演示企业 · 示例空间 <span className="chev">⌄</span></div><nav>{nav.map(n => <button key={n.key} className={active === n.key ? 'nav-item active' : 'nav-item'} onClick={() => setActive(n.key)}><span className="nav-icon">{n.icon}</span>{n.label}</button>)}</nav><div className="sidebar-bottom"><div className="avatar">管</div><div><strong>企业管理员</strong><small>演示账户</small></div><span className="chev">•••</span></div></aside>
    <main className="main"><header className="topbar"><div className="mobile-brand"><div className="brand-mark">◷</div><strong>工时云</strong></div><div className="crumb">企业空间 <span>/</span> {pageTitle}</div><div className="top-actions"><span className="demo-tag">演示环境</span><div className="avatar small">管</div></div></header>
      <section className="content"><div className="page-heading"><div><p className="eyebrow">{today}</p><h1>{active === 'overview' ? '早上好，管理员 👋' : pageTitle}</h1><p className="muted">{active === 'overview' ? '这里是企业今天的考勤与薪资概况。' : '演示数据仅用于体验产品流程，不代表真实考勤或工资记录。'}</p></div>{active !== 'employees' && <button className="primary" onClick={() => setActive(active === 'overview' ? 'attendance' : 'overview')}>{active === 'overview' ? '查看考勤 →' : '返回工作台'}</button>}</div>
      {active === 'overview' && <>
        <div className="stats-grid"><article className="stat-card"><div className="stat-top"><span>员工总数</span><span className="stat-icon blue">♙</span></div><strong>{128 + staff.length - initialStaff.length}</strong><small><b className="positive">+6</b> 较上月</small></article><article className="stat-card"><div className="stat-top"><span>今日已打卡</span><span className="stat-icon green">◷</span></div><strong>{116 + (punched ? 1 : 0)} <em>/ 128</em></strong><small><b className="positive">90.6%</b> 到岗率</small></article><article className="stat-card"><div className="stat-top"><span>考勤异常</span><span className="stat-icon orange">!</span></div><strong>8</strong><small><b className="warning">待处理</b> 今日异常</small></article><article className="stat-card"><div className="stat-top"><span>本月预计工资</span><span className="stat-icon violet">￥</span></div><strong>¥286,450</strong><small>11 月工资周期 · 演示估算</small></article></div>
        <div className="panel-grid"><section className="panel attendance-panel"><div className="panel-heading"><div><h2>今日考勤</h2><p>员工实时打卡概览</p></div><button className="text-button" onClick={() => setActive('attendance')}>全部记录 →</button></div><div className="attendance-summary"><div className="summary-ring"><strong>90.6%</strong><small>出勤率</small></div><div className="summary-list"><div><i className="dot green-dot"/>已打卡 <b>{116 + (punched ? 1 : 0)}</b></div><div><i className="dot yellow-dot"/>迟到 <b>4</b></div><div><i className="dot red-dot"/>缺卡 / 未到 <b>8</b></div></div></div><div className="bar-track"><div className="bar-green" style={{ width: '90.6%' }}/><div className="bar-yellow" style={{ width: '3.1%' }}/></div><div className="panel-footer"><span>目标人数 128</span><span>更新时间 {new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</span></div></section>
          <section className="panel quick-panel"><div className="panel-heading"><div><h2>快捷操作</h2><p>常用管理功能</p></div></div><div className="quick-grid"><button onClick={() => { setActive('employees'); setShowAdd(true); }}><span className="quick-icon blue">＋</span><b>添加员工</b><small>创建员工档案</small></button><button onClick={() => setActive('attendance')}><span className="quick-icon green">✓</span><b>考勤核对</b><small>处理异常记录</small></button><button onClick={() => setActive('payroll')}><span className="quick-icon violet">￥</span><b>工资核算</b><small>计算本月薪资</small></button><button onClick={() => setActive('reports')}><span className="quick-icon orange">▤</span><b>导出报表</b><small>查看数据统计</small></button></div></section></div>
        <section className="panel staff-panel"><div className="panel-heading"><div><h2>最近打卡</h2><p>今日员工打卡动态</p></div><button className="text-button" onClick={() => setActive('attendance')}>查看全部 →</button></div>{staffTable(staff.slice(0, 5))}</section>
        <section className="panel punch-panel"><div><h2>移动打卡预览</h2><p>此操作仅改变本地演示状态，尚未写入服务器或真实考勤记录。</p></div><button className={punched ? 'primary punched' : 'primary'} onClick={() => setPunched(true)} disabled={punched}>{punched ? '✓ 已完成演示打卡' : '模拟上班打卡'}</button></section>
      </>}
      {active === 'attendance' && <>
        <div className="stats-grid"><article className="stat-card"><div className="stat-top">应出勤员工</div><strong>128</strong><small>今日排班人数 · 演示</small></article><article className="stat-card"><div className="stat-top">已打卡</div><strong>{attendanceCount + 110}</strong><small>包含演示记录</small></article><article className="stat-card"><div className="stat-top">迟到</div><strong>{staff.filter(s => s.state === '迟到').length + 3}</strong><small>需要核对</small></article><article className="stat-card"><div className="stat-top">缺卡</div><strong>{staff.filter(s => s.state === '缺卡').length + 6}</strong><small>待补卡或确认</small></article></div>
        <section className="panel engine-panel">
          <div className="panel-heading"><div><h2>考勤规则实时试算</h2><p>此面板直接调用考勤计算引擎，修改参数会立即重新计算。</p></div><span className="demo-tag">本地试算</span></div>
          <div className="engine-fields">
            <label>班次开始<input type="time" value={shiftStart} onChange={e => setShiftStart(e.target.value)}/></label>
            <label>班次结束<input type="time" value={shiftEnd} onChange={e => setShiftEnd(e.target.value)}/></label>
            <label>上班打卡<input type="time" value={punchInTime} onChange={e => setPunchInTime(e.target.value)} disabled={!includePunchIn}/></label>
            <label>下班打卡<input type="time" value={punchOutTime} onChange={e => setPunchOutTime(e.target.value)} disabled={!includePunchOut}/></label>
            <label>休息开始<input type="time" value={breakStart} onChange={e => setBreakStart(e.target.value)}/></label>
            <label>休息结束<input type="time" value={breakEnd} onChange={e => setBreakEnd(e.target.value)}/></label>
          </div>
          <div className="engine-toggles">
            <label><input type="checkbox" checked={includePunchIn} onChange={e => setIncludePunchIn(e.target.checked)}/> 有上班打卡</label>
            <label><input type="checkbox" checked={includePunchOut} onChange={e => setIncludePunchOut(e.target.checked)}/> 有下班打卡</label>
            <label><input type="checkbox" checked={approveOvertime} onChange={e => setApproveOvertime(e.target.checked)}/> 已审批加班</label>
          </div>
          {attendanceCalculation.error ? <div className="engine-error">无法计算：{attendanceCalculation.error}</div> : attendanceCalculation.result && <div className="engine-results">
            <div className="engine-result-main"><span>计薪正常工时</span><strong>{attendanceCalculation.result.regularMinutes} 分钟</strong><small>约 {(attendanceCalculation.result.regularMinutes / 60).toFixed(2)} 小时</small></div>
            <div><span>考勤状态</span><strong>{({complete:'正常',late:'迟到',early_leave:'早退',late_and_early_leave:'迟到且早退',missing_in:'缺少上班卡',missing_out:'缺少下班卡',missing_both:'缺少上下班卡'} as Record<string,string>)[attendanceCalculation.result.status]}</strong></div>
            <div><span>实际出勤</span><strong>{attendanceCalculation.result.attendedMinutes} 分钟</strong></div>
            <div><span>休息扣除</span><strong>{attendanceCalculation.result.unpaidBreakMinutes} 分钟</strong></div>
            <div><span>迟到 / 早退</span><strong>{attendanceCalculation.result.lateMinutes} / {attendanceCalculation.result.earlyLeaveMinutes} 分钟</strong></div>
            <div><span>申请加班</span><strong>{attendanceCalculation.result.requestedOvertimeMinutes} 分钟</strong></div>
            <div><span>已批准加班</span><strong>{attendanceCalculation.result.approvedOvertimeMinutes} 分钟</strong></div>
            <div><span>未批准加班</span><strong>{attendanceCalculation.result.unpaidOvertimeMinutes} 分钟</strong></div>
          </div>}
          <div className="notice">试算日期按北京时间生成。完整班次固定扣除 90 分钟休息；不完整班次按实际休息区间与出勤重叠部分扣除。提前到岗不计薪，超出班次结束的时间需审批后才计入已批准加班。数据仅在当前浏览器内计算，不会保存到服务器。</div>
        </section>
        <section className="panel"><div className="panel-heading"><div><h2>考勤记录</h2><p>按员工和状态筛选演示数据</p></div><button className="primary" onClick={() => setPunched(true)} disabled={punched}>{punched ? '已模拟打卡' : '模拟本人打卡'}</button></div><div className="toolbar"><input value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索员工或部门"/><select value={filter} onChange={e => setFilter(e.target.value)}><option>全部</option><option>正常</option><option>迟到</option><option>缺卡</option></select></div>{staffTable(filteredStaff)}</section>
      </>}
      {active === 'employees' && <section className="panel"><div className="panel-heading"><div><h2>员工档案</h2><p>当前为浏览器本地演示数据，刷新页面后新增记录会重置。</p></div><button className="primary" onClick={() => setShowAdd(v => !v)}>{showAdd ? '取消' : '+ 添加员工'}</button></div>{showAdd && <div className="add-form"><input value={newName} onChange={e => setNewName(e.target.value)} placeholder="员工姓名"/><select value={newTeam} onChange={e => setNewTeam(e.target.value)}><option>运营部</option><option>仓储部</option><option>门店一组</option><option>财务部</option></select><button className="primary" onClick={addEmployee} disabled={!newName.trim()}>保存员工</button></div>}<div className="toolbar"><input value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索姓名或部门"/></div><div className="employee-summary">共 {staff.length} 位演示员工</div>{staffTable(staff.filter(s => s.name.includes(query.trim()) || s.team.includes(query.trim())))}</section>}
      {active === 'payroll' && <section className="panel payroll-panel"><div className="panel-heading"><div><h2>工资试算器</h2><p>仅为交互演示，不作为实际工资或合规薪资结果。</p></div><span className="demo-tag">试算模式</span></div><div className="payroll-fields"><label>月基本工资（元）<input inputMode="decimal" value={salary} onChange={e => { setSalary(e.target.value); setCalculated(false); }}/></label><label>计薪天数<input inputMode="decimal" value={days} onChange={e => { setDays(e.target.value); setCalculated(false); }}/></label><label>审批通过加班小时<input inputMode="decimal" value={overtime} onChange={e => { setOvertime(e.target.value); setCalculated(false); }}/></label></div><button className="primary" onClick={() => setCalculated(true)}>计算演示工资</button>{calculated && <div className="pay-result"><span>演示应发金额</span><strong>{money(pay)}</strong><small>示例公式：月薪 ÷ 22 × 计薪天数 + 月薪 ÷ 174 × 加班小时 × 1.5。实际规则须由企业配置并经过审核。</small></div>}<div className="notice">正式工资引擎仍在开发中。当前试算器不包含社保个税、津贴扣款、节假日规则、缺勤规则及地区法规，不可用于正式发薪。</div></section>}
      {active === 'reports' && <section className="panel"><div className="panel-heading"><div><h2>经营报表</h2><p>示例汇总指标，后续接入可追溯的真实数据。</p></div></div><div className="report-grid"><div><span>本月出勤率</span><strong>96.8%</strong><small>演示数据</small></div><div><span>异常考勤</span><strong>23</strong><small>待处理记录</small></div><div><span>预计工资总额</span><strong>¥286,450</strong><small>未审核</small></div></div><div className="notice">报表导出功能将在接入真实数据与权限校验后开放，避免导出未经授权的员工及薪酬信息。</div></section>}
      <footer>WorkTime SaaS · MVP Preview <span>演示数据，不代表真实业务记录</span></footer></section>
    </main>
  </div>;
}
