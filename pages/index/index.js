const app = getApp()
const pad = n => String(n).padStart(2, '0')
const dateKey = (year, month, day) => `${year}-${pad(month)}-${pad(day)}`

Page({
  data: {
    photographers: [], filters: [], weekdays: ['日','一','二','三','四','五','六'], activeFilter: 'all', year: 0, month: 0,
    monthLabel: '', weeks: [], schedules: [], loading: true,
    monthPickerVisible: false, pickerYears: [],
    pickerMonths: Array.from({ length: 12 }, (_, i) => i + 1), pickerValue: [0, 0],
    selectedDate: '', selectedLabel: '', selectedSchedules: [], detailVisible: false
  },
  onLoad() {
    const now = new Date()
    const photographers = app.globalData.photographers
    this.setData({ photographers, filters: [{ id: 'all', name: '全部' }, ...photographers], year: now.getFullYear(), month: now.getMonth() + 1 })
    this.loadMonth()
  },
  onShow() {
    if (!this._hasShown) { this._hasShown = true; return }
    if (this.data.year) this.loadMonth(false)
  },
  onPullDownRefresh() { this.loadMonth(false).finally(() => wx.stopPullDownRefresh()) },
  async callApi(action, data = {}) {
    const res = await wx.cloud.callFunction({ name: 'scheduleApi', data: { action, ...data } })
    if (!res.result || res.result.ok === false) throw new Error(res.result && res.result.message || '服务暂不可用')
    return res.result
  },
  async loadMonth(showLoading = true) {
    if (showLoading) this.setData({ loading: true })
    try {
      const result = await this.callApi('list', { year: this.data.year, month: this.data.month })
      this.setData({ schedules: result.data || [] })
      if (result.total < 142 && !this._bootstrapping && !this._bootstrapAttempted) {
        await this.bootstrapInitialData()
        return
      }
    } catch (error) {
      wx.showModal({ title: '暂时无法读取档期', content: `${error.message}\n\n请确认云函数 scheduleApi 已上传并部署。`, showCancel: false })
      this.setData({ schedules: [] })
    } finally {
      this.buildCalendar()
      this.setData({ loading: false })
    }
  },
  buildCalendar() {
    const { year, month, schedules, activeFilter, photographers } = this.data
    const firstWeekday = new Date(year, month - 1, 1).getDay()
    const dayCount = new Date(year, month, 0).getDate()
    const today = new Date()
    const map = {}
    schedules.forEach(item => {
      if (activeFilter !== 'all' && item.photographerId !== activeFilter) return
      if (!map[item.date]) map[item.date] = []
      map[item.date].push(item)
    })
    const cells = []
    for (let i = 0; i < firstWeekday; i += 1) cells.push({ empty: true, key: `e${i}` })
    for (let day = 1; day <= dayCount; day += 1) {
      const key = dateKey(year, month, day)
      const items = (map[key] || []).map(item => ({ ...item, color: (photographers.find(p => p.id === item.photographerId) || {}).color }))
      cells.push({ key, day, date: key, items, isToday: today.getFullYear() === year && today.getMonth() + 1 === month && today.getDate() === day })
    }
    while (cells.length % 7) cells.push({ empty: true, key: `t${cells.length}` })
    const weeks = []
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
    this.setData({ weeks, monthLabel: `${year}年${month}月` })
  },
  changeMonth(e) {
    const delta = Number(e.currentTarget.dataset.delta)
    let { year, month } = this.data
    month += delta
    if (month < 1) { month = 12; year -= 1 }
    if (month > 12) { month = 1; year += 1 }
    this.setData({ year, month, detailVisible: false }); this.loadMonth()
  },
  openMonthPicker() {
    const startYear = Math.min(2020, this.data.year)
    const endYear = Math.max(2100, this.data.year)
    const pickerYears = Array.from({ length: endYear - startYear + 1 }, (_, i) => startYear + i)
    this.setData({
      pickerYears,
      pickerValue: [this.data.year - startYear, this.data.month - 1],
      monthPickerVisible: true,
      detailVisible: false
    })
  },
  changePickerValue(e) { this.setData({ pickerValue: e.detail.value }) },
  closeMonthPicker() { this.setData({ monthPickerVisible: false }) },
  confirmMonthPicker() {
    const [yearIndex, monthIndex] = this.data.pickerValue
    const year = this.data.pickerYears[yearIndex]
    const month = this.data.pickerMonths[monthIndex]
    if (!year || !month) return
    this.setData({ monthPickerVisible: false })
    if (year === this.data.year && month === this.data.month) return
    this.setData({ year, month, detailVisible: false })
    this.loadMonth()
  },
  goToday() {
    const now = new Date()
    this.setData({ year: now.getFullYear(), month: now.getMonth() + 1, detailVisible: false }); this.loadMonth()
  },
  changeFilter(e) { this.setData({ activeFilter: e.currentTarget.dataset.id }); this.buildCalendar() },
  selectDate(e) {
    const date = e.currentTarget.dataset.date
    if (!date) return
    const [year, month, day] = date.split('-')
    const selectedSchedules = this.data.schedules.filter(item => item.date === date)
      .map(item => ({ ...item, color: (this.data.photographers.find(p => p.id === item.photographerId) || {}).color }))
    this.setData({ selectedDate: date, selectedLabel: `${year}年${Number(month)}月${Number(day)}日`, selectedSchedules, detailVisible: true })
  },
  closeDetail() { this.setData({ detailVisible: false }) },
  stopPropagation() {},
  addSchedule(e) {
    const date = e.currentTarget.dataset.date || this.data.selectedDate || dateKey(this.data.year, this.data.month, 1)
    wx.navigateTo({ url: `/pages/edit/edit?date=${date}` })
  },
  editSchedule(e) { wx.navigateTo({ url: `/pages/edit/edit?id=${e.currentTarget.dataset.id}` }) },
  async bootstrapInitialData() {
    this._bootstrapping = true
    this._bootstrapAttempted = true
    wx.showLoading({ title: '初始化档期', mask: true })
    try {
      let cursor = 0
      let inserted = 0
      let skipped = 0
      let done = false
      while (!done) {
        const result = await this.callApi('seed', { cursor })
        inserted += result.inserted
        skipped += result.skipped
        cursor = result.nextCursor
        done = result.done
        wx.showLoading({ title: `${Math.min(cursor, result.total)}/${result.total}`, mask: true })
      }
      console.info('初始档期完成', { inserted, skipped, total: cursor })
    } catch (error) {
      wx.showModal({ title: '初始化失败', content: error.message, showCancel: false })
    } finally {
      this._bootstrapping = false
      wx.hideLoading()
    }
    await this.loadMonth(false)
  }
})
