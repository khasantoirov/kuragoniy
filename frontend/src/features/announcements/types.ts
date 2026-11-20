export interface Announcement {
  id: number
  text: string
  at: string
  by: string | null
  by_name: string | null
  /** '' everyone, or one fan window only */
  fan?: '' | 'fizika' | 'steam'
}
