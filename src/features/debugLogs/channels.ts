import { WebviewMessenger } from '../../webview/WebviewMessenger';
import { DebugLogService } from './debugLogService';
import { DebugLogProvider } from './debugLogProvider';

export function registerDebugLogChannels(messenger: WebviewMessenger) {
    messenger.registerHandler('debugLogs:list', async (payload: any) => {
        const { userFilter, size, sizeDirection } = payload || {};
        return await DebugLogService.getDebugLogs(userFilter, size, sizeDirection);
    });

    messenger.registerHandler('debugLogs:users', async (payload: any) => {
        const { search } = payload || {};
        return await DebugLogService.getUsers(search);
    });

    messenger.registerHandler('debugLogs:methodName', async (payload: any) => {
        const { logId } = payload;
        if (!logId) {throw new Error('logId is required');}
        const methodName = await DebugLogService.getMethodName(logId);
        return { methodName, logId };
    });

    messenger.registerHandler('debugLogs:downloadOpen', async (payload: any) => {
        const { logId } = payload;
        if (!logId) {throw new Error('logId is required');}
        const path = await DebugLogService.downloadAndOpenLog(logId);
        return { message: 'Log opened in VS Code editor', path };
    });

    messenger.registerHandler('debugLogs:bulkDelete', async (payload: any) => {
        const { userName } = payload;
        return await DebugLogService.bulkDeleteLogs(userName);
    });

    messenger.registerHandler('debugLogs:traceFlag:start', async (payload: any) => {
        const { userId } = payload;
        if (!userId) {throw new Error('userId is required');}
        const traceFlagId = await DebugLogProvider.createTraceFlag(userId);
        return { traceFlagId, message: 'Trace flag created successfully' };
    });

    messenger.registerHandler('debugLogs:traceFlag:stop', async (payload: any) => {
        const { traceFlagId } = payload;
        if (!traceFlagId) {throw new Error('traceFlagId is required');}
        await DebugLogProvider.deleteTraceFlag(traceFlagId);
        return { message: 'Trace flag deleted successfully' };
    });
}
