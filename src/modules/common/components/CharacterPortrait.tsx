import DoodleCharacter from '@/modules/common/doodles/DoodleCharacter'
import { cn } from '@/modules/common/utilities/cn'

interface CharacterPortraitProps {
  src: string | null
  doodleSize: number
  className?: string
}

export function CharacterPortrait({
  src,
  doodleSize,
  className,
}: CharacterPortraitProps) {
  return (
    <div
      className={cn('flex items-center justify-center bg-muted/40', className)}
    >
      {src ? (
        <img src={src} alt="" className="h-full w-full object-cover" />
      ) : (
        <DoodleCharacter size={doodleSize} />
      )}
    </div>
  )
}
