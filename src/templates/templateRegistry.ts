import type { CharacterCard } from '../composables/useMakerState'
import mvuTemplate from './mvuTemplate.json'

export interface TemplateEntry {
    id: string
    name: string
    genre: string
    template: CharacterCard
}

export const templates: TemplateEntry[] = [
    {
        id: 'mvu-rpg',
        name: 'MVU RPG',
        genre: 'RPG',
        template: mvuTemplate as unknown as CharacterCard,
    },
    {
        id: 'mvu-love',
        name: 'MVU Love',
        genre: 'Love',
        template: mvuTemplate as unknown as CharacterCard,
    },
]

export function getTemplateById(id: string): TemplateEntry | null {
    return templates.find(t => t.id === id) ?? null
}
