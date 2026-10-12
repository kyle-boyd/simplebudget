import * as React from "react"

import { Input } from "@/components/ui/input"
import { useCurrency } from "@/hooks/useUserSettings"

interface AmountInputProps {
  value: number | undefined
  /** Fires on every keystroke with the parsed value. */
  onChange?: (amount: number) => void
  /** Fires on blur with the parsed value — use this for persisted values. */
  onCommit?: (amount: number) => void
  className?: string
  id?: string
  placeholder?: string
}

function formatAmount(amount: number, symbol: string): string {
  return `${symbol}${amount % 1 === 0 ? amount.toFixed(0) : amount.toFixed(2)}`
}

function parseAmount(draft: string): number {
  const parsed = parseFloat(draft.replace(/[^0-9.-]/g, ""))
  return Number.isFinite(parsed) ? parsed : 0
}

/**
 * Currency amount field that keeps the currency symbol pinned in front of the
 * value while the user types, and reports a parsed number to its owner.
 */
export function AmountInput({
  value,
  onChange,
  onCommit,
  className,
  id,
  placeholder,
}: AmountInputProps) {
  const { currencySymbol } = useCurrency()
  const [draft, setDraft] = React.useState<string | null>(null)

  const display = draft ?? formatAmount(value || 0, currencySymbol)

  return (
    <Input
      id={id}
      type="text"
      inputMode="decimal"
      value={display}
      placeholder={placeholder ?? `${currencySymbol}0`}
      className={className}
      onFocus={() => setDraft(formatAmount(value || 0, currencySymbol))}
      onChange={(event) => {
        const typed = event.target.value
        const next = typed.startsWith(currencySymbol)
          ? typed
          : `${currencySymbol}${typed.replace(/^[^0-9.-]*/, "")}`
        setDraft(next)
        onChange?.(parseAmount(next))
      }}
      onBlur={() => {
        onCommit?.(parseAmount(draft ?? display))
        setDraft(null)
      }}
    />
  )
}
