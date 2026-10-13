import type { ReactNode } from 'react'

type ViewHeaderProps = {
  title: string
  description: string
  onBack: () => void
  action?: ReactNode
}

export function ViewHeader({ title, description, onBack, action }: ViewHeaderProps) {
  return (
    <div className="view-heading">
      <div className="view-heading-copy">
        <button className="back-button" type="button" onClick={onBack}>
          العودة إلى لوحة التحكم
        </button>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  )
}
