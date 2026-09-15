import { BigLinkButton } from '@/ui/BigButton'
import { EmptyState } from '@/ui/EmptyState'
import { Screen } from '@/ui/Screen'

export function NotFoundScreen() {
  return (
    <Screen>
      <div className="flex flex-1 items-center">
        <EmptyState
          title="Hier ist nichts"
          action={<BigLinkButton to="/">Zum Anfang</BigLinkButton>}
        />
      </div>
    </Screen>
  )
}
