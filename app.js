App({
  onLaunch() {
    if (!wx.cloud) {
      wx.showModal({ title: '基础库版本过低', content: '请升级微信后再使用', showCancel: false })
      return
    }
    wx.cloud.init({ env: 'shanli-d7gagpq0537ff1303', traceUser: true })
  },
  globalData: {
    photographers: [
      { id: 'shanli', name: '山梨', color: '#E67E5F' },
      { id: 'muyang', name: '牧羊', color: '#5C8D89' },
      { id: 'xiaoguai', name: '小拐', color: '#8B78B8' }
    ]
  }
})
