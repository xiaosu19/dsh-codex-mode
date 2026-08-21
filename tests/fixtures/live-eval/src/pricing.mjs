function money(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export function summarizeCart(lines, { discountRate = 0, taxRate = 0 } = {}) {
  const subtotal = money(
    lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0),
  )
  const discount = money(subtotal * discountRate)
  const taxable = subtotal
  const tax = money(taxable * taxRate)

  return {
    subtotal,
    discount,
    tax,
    total: money(taxable + tax),
  }
}
