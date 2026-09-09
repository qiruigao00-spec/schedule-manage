const app = getApp()
const pad = n => String(n).padStart(2, '0')
const monthDays = (year, month) => Array.from({ length: new Date(year, month, 0).getDate() }, (_, i) => i + 1)

Page({
  data: {
    id: '', photographers: [], photographerIndex: 0, date: '',
    projectName: '', location: '', notes: '', loading: false, editing: false,
    datePickerVisible: false, pickerYears: [], pickerDays: [],
    photographerPickerVisible: false, pendingPhotographerIndex: 0,
    pickerMonths: Array.from({ length: 12 }, (_, i) => i + 1), pickerValue: [0, 0, 0]
  },
  onLoad(options) {
    this.setData({ photographers: app.globalData.photographers, date: options.date || '', id: options.id || '', editing: !!options.id })
    wx.setNavigationBarTitle({ title: options.id ? '编辑档期' : '新增档期' })
    if (options.id) this.loadDetail(options.id)
  },
  async callApi(action, data = {}) {
    const res = await wx.cloud.callFunction({ name: 'scheduleApi', data: { action, ...data } })
    if (!res.result || res.result.ok === false) throw new Error(res.result && res.result.message || '服务暂不可用')
    return res.result
  },
  async loadDetail(id) {
    wx.showLoading({ title: '读取中' })
    try {
      const result = await this.callApi('get', { id })
      const item = result.data
      const photographerIndex = Math.max(0, this.data.photographers.findIndex(p => p.id === item.photographerId))
      this.setData({ photographerIndex, date: item.date, projectName: item.projectName || '', location: item.location || '', notes: item.notes || '' })
    } catch (error) { wx.showModal({ title: '读取失败', content: error.message, showCancel: false }) }
    finally { wx.hideLoading() }
  },
  openPhotographerPicker() {
    this.setData({
      pendingPhotographerIndex: this.data.photographerIndex,
      photographerPickerVisible: true,
      datePickerVisible: false
    })
  },
  selectPhotographer(e) {
    const index = Number(e.currentTarget.dataset.index)
    if (!Number.isInteger(index) || !this.data.photographers[index]) return
    this.setData({ pendingPhotographerIndex: index })
  },
  closePhotographerPicker() { this.setData({ photographerPickerVisible: false }) },
  confirmPhotographerPicker() {
    if (!this.data.photographers[this.data.pendingPhotographerIndex]) return
    this.setData({
      photographerIndex: this.data.pendingPhotographerIndex,
      photographerPickerVisible: false
    })
  },
  openDatePicker() {
    const now = new Date()
    const [year, month, day] = this.data.date
      ? this.data.date.split('-').map(Number)
      : [now.getFullYear(), now.getMonth() + 1, now.getDate()]
    const startYear = Math.min(2020, year)
    const endYear = Math.max(2100, year)
    this.setData({
      pickerYears: Array.from({ length: endYear - startYear + 1 }, (_, i) => startYear + i),
      pickerDays: monthDays(year, month),
      pickerValue: [year - startYear, month - 1, day - 1],
      datePickerVisible: true,
      photographerPickerVisible: false
    })
  },
  changeDatePicker(e) {
    const [yearIndex, monthIndex, dayIndex] = e.detail.value
    const year = this.data.pickerYears[yearIndex]
    const month = this.data.pickerMonths[monthIndex]
    if (!year || !month) return
    const pickerDays = monthDays(year, month)
    this.setData({
      pickerDays,
      pickerValue: [yearIndex, monthIndex, Math.max(0, Math.min(dayIndex, pickerDays.length - 1))]
    })
  },
  closeDatePicker() { this.setData({ datePickerVisible: false }) },
  stopPropagation() {},
  confirmDatePicker() {
    const [yearIndex, monthIndex, dayIndex] = this.data.pickerValue
    const year = this.data.pickerYears[yearIndex]
    const month = this.data.pickerMonths[monthIndex]
    const day = this.data.pickerDays[dayIndex]
    if (!year || !month || !day) return
    this.setData({ date: `${year}-${pad(month)}-${pad(day)}`, datePickerVisible: false })
  },
  changeField(e) { this.setData({ [e.currentTarget.dataset.field]: e.detail.value }) },
  async save() {
    if (!this.data.date) { wx.showToast({ title: '请选择拍摄日期', icon: 'none' }); return }
    const photographer = this.data.photographers[this.data.photographerIndex]
    this.setData({ loading: true })
    try {
      await this.callApi('save', {
        id: this.data.id,
        schedule: {
          photographerId: photographer.id, photographerName: photographer.name,
          date: this.data.date, projectName: this.data.projectName.trim(),
          location: this.data.location.trim(), notes: this.data.notes.trim()
        }
      })
      wx.showToast({ title: '已保存', icon: 'success' })
      setTimeout(() => wx.navigateBack(), 500)
    } catch (error) { wx.showModal({ title: '无法保存', content: error.message, showCancel: false }) }
    finally { this.setData({ loading: false }) }
  },
  async remove() {
    const confirmed = await new Promise(resolve => wx.showModal({ title: '删除这条档期？', content: '删除后无法恢复，请确认没有误操作。', confirmColor: '#D55745', success: res => resolve(res.confirm) }))
    if (!confirmed) return
    wx.showLoading({ title: '删除中', mask: true })
    try {
      await this.callApi('delete', { id: this.data.id })
      wx.showToast({ title: '已删除', icon: 'success' }); setTimeout(() => wx.navigateBack(), 500)
    } catch (error) { wx.showModal({ title: '删除失败', content: error.message, showCancel: false }) }
    finally { wx.hideLoading() }
  }
})
