 
export interface WebviewRequest {
    type: 'request';
    id: string;
    channel: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    payload?: any;
}

export interface WebviewResponse {
    type: 'response';
    id: string;
    ok: boolean;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data?: any;
    error?: string;
}

export interface WebviewEvent {
    command: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data?: any;
    component?: string;
}
