// Run from the project root: node < tests/date-picker.test.js
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
let definition
vm.runInNewContext(fs.readFileSync('pages/edit/edit.js', 'utf8'), {
  getApp: () => ({ globalData: {} }),
  Page: page => { definition = page }
})
const page = {
  ...definition,
  data: JSON.parse(JSON.stringify(definition.data)),
  setData(values) { Object.assign(this.data, values) }
}
page.data.date = '2028-01-31'
page.openDatePicker()
const leapYearIndex = page.data.pickerYears.indexOf(2028)
page.changeDatePicker({ detail: { value: [leapYearIndex, 1, 30] } })
assert.equal(page.data.pickerDays.length, 29)
assert.equal(page.data.pickerValue[2], 28)
page.confirmDatePicker()
assert.equal(page.data.date, '2028-02-29')
assert.equal(page.data.datePickerVisible, false)

page.openDatePicker()
page.changeDatePicker({ detail: { value: [leapYearIndex - 1, 1, 28] } })
assert.equal(page.data.pickerDays.length, 28)
page.confirmDatePicker()
assert.equal(page.data.date, '2027-02-28')

page.data.date = '2027-03-31'
page.openDatePicker()
page.changeDatePicker({ detail: { value: [leapYearIndex - 1, 3, 30] } })
assert.equal(page.data.pickerDays.length, 30)
assert.equal(page.data.pickerValue[2], 29)
page.closeDatePicker()
assert.equal(page.data.date, '2027-03-31')
page.openDatePicker()
assert.equal(page.data.pickerValue[1], 2)
assert.equal(page.data.pickerValue[2], 30)
assert.equal(page.data.pickerDays.length, 31)
console.log('PASS: leap years, month lengths, confirmation, cancellation and reopening')
