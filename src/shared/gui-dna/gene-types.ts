// gene-types.ts — the shapes the gene components take (GUI-DNA §5).

export type ResultStatus = 'success' | 'warning' | 'danger'

/** One line of a result list: its status picks the icon and the colour. */
export interface ResultLine {
    status: ResultStatus
    text: string
}

export type NoticeStatus = 'info' | 'warning' | 'danger'
