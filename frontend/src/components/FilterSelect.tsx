import { useId } from 'react'
import * as Select from '@radix-ui/react-select'

type Option = { value: string; label: string; tone?: string }
export default function FilterSelect({
  label,
  value,
  options,
  onChange,
  disabled = false,
}: {
  label: string
  value: string
  options: Option[]
  onChange: (value: string) => void
  disabled?: boolean
}) {
  const id = useId()
  const selected = options.find((option) => option.value === value)
  return (
    <div className="filter-field">
      <label htmlFor={id}>{label}</label>
      <Select.Root
        value={value || '__all__'}
        onValueChange={(next) => onChange(next === '__all__' ? '' : next)}
        disabled={disabled}
      >
        <Select.Trigger
          id={id}
          aria-label={label}
          className={`filter-trigger ${value ? 'has-value' : ''}`}
        >
          <Select.Value>
            <span className="filter-value">
              {selected?.tone && (
                <span aria-hidden="true" className={`severity-dot ${selected.tone}`} />
              )}
              {selected?.label || value}
            </span>
          </Select.Value>
          <Select.Icon className="select-chevron">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="m6 9 6 6 6-6"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Content
            position="popper"
            sideOffset={7}
            collisionPadding={12}
            className="filter-menu"
          >
            <Select.ScrollUpButton className="filter-scroll" aria-label="Scroll up">
              ⌃
            </Select.ScrollUpButton>
            <Select.Viewport className="filter-menu-viewport">
              <Select.Group>
                <Select.Label className="filter-menu-label">{label}</Select.Label>
                {options.map((option) => (
                  <Select.Item
                    key={option.value}
                    value={option.value || '__all__'}
                    textValue={option.label}
                    className="filter-option"
                  >
                    {option.tone && (
                      <span aria-hidden="true" className={`severity-dot ${option.tone}`} />
                    )}
                    <Select.ItemText>{option.label}</Select.ItemText>
                    <Select.ItemIndicator className="filter-check">
                      <svg
                        width="15"
                        height="15"
                        viewBox="0 0 24 24"
                        fill="none"
                        aria-hidden="true"
                      >
                        <path
                          d="m5 12 4 4L19 6"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </Select.ItemIndicator>
                  </Select.Item>
                ))}
              </Select.Group>
            </Select.Viewport>
            <Select.ScrollDownButton className="filter-scroll" aria-label="Scroll down">
              ⌄
            </Select.ScrollDownButton>
          </Select.Content>
        </Select.Portal>
      </Select.Root>
    </div>
  )
}
