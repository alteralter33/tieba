"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.login = login;
exports.getTiebaList = getTiebaList;
exports.getTbs = getTbs;
exports.signTieba = signTieba;
/**
 * 百度贴吧API服务
 * 包含与百度贴吧API通信的核心功能
 */
const axios_1 = __importDefault(require("axios"));
const utils_1 = require("./utils");
// 辅助函数：延时等待
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
// 全局配置
const MAX_RETRIES = 3; // 最大重试次数
const RETRY_DELAY = 3000; // 重试延迟(ms)
const RETRY_MULTIPLIER = 2; // 重试延迟倍数
/**
 * 带重试机制的请求函数
 * @param requestFn - 请求函数
 * @param operationName - 操作名称
 * @param maxRetries - 最大重试次数
 * @param initialDelay - 初始延迟(ms)
 * @param delayMultiplier - 延迟倍数
 * @returns 请求结果
 */
function withRetry(requestFn_1, operationName_1) {
    return __awaiter(this, arguments, void 0, function* (requestFn, operationName, maxRetries = MAX_RETRIES, initialDelay = RETRY_DELAY, delayMultiplier = RETRY_MULTIPLIER) {
        let retries = 0;
        let delay = initialDelay;
        while (true) {
            try {
                return yield requestFn();
            }
            catch (error) {
                retries++;
                const axiosError = error;
                // 429错误特殊处理
                const isRateLimited = axiosError.response && axiosError.response.status === 429;
                if (retries > maxRetries || (!isRateLimited && axiosError.response && axiosError.response.status >= 400 && axiosError.response.status < 500)) {
                    console.error(`❌ ${operationName}失败(尝试 ${retries}次): ${axiosError.message}`);
                    throw error;
                }
                // 计算下次重试延迟
                if (isRateLimited) {
                    // 限流时使用更长的延迟
                    delay = delay * delayMultiplier * 2;
                    console.warn(`⏳ 请求被限流，将在 ${delay}ms 后重试 (${retries}/${maxRetries})...`);
                }
                else {
                    delay = delay * delayMultiplier;
                    console.warn(`⏳ ${operationName}失败，将在 ${delay}ms 后重试 (${retries}/${maxRetries})...`);
                }
                yield sleep(delay);
            }
        }
    });
}
/**
 * 验证BDUSS是否有效并获取用户信息
 * @param bduss - 百度BDUSS
 * @returns 用户信息
 */
function login(bduss) {
    return __awaiter(this, void 0, void 0, function* () {
        return withRetry(() => __awaiter(this, void 0, void 0, function* () {
            // 通过获取用户同步信息来验证BDUSS是否有效
            const url = 'https://tieba.baidu.com/mo/q/sync';
            const headers = {
                'Cookie': `BDUSS=${bduss}`,
                'Accept': 'application/json, text/javascript, */*; q=0.01',
                'Accept-Encoding': 'gzip, deflate, br',
                'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6',
                'Connection': 'keep-alive',
                'Host': 'tieba.baidu.com',
                'Referer': 'https://tieba.baidu.com/home/main',
                'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari/604.1'
            };
            const response = yield axios_1.default.get(url, {
                headers: headers
            });
            if (!response.data || response.data.no !== 0 || response.data.error !== 'success') {
                throw new Error('验证BDUSS失败，可能已过期');
            }
            const userId = response.data.data.user_id;
            const userInfo = {
                status: 200,
                bduss: bduss,
                userId: userId,
                isValid: true,
                deviceId: (0, utils_1.generateDeviceId)()
            };
            console.log('🔐 验证BDUSS成功');
            return userInfo;
        }), '验证BDUSS');
    });
}
/**
 * 获取用户关注的贴吧列表及TBS
 * @param bduss - 百度BDUSS
 * @returns 贴吧列表和TBS
 */
function getTiebaList(bduss) {
    return __awaiter(this, void 0, void 0, function* () {
        const headers = {
            'Cookie': `BDUSS=${bduss}`,
            'Content-Type': 'application/octet-stream',
            'Referer': 'https://tieba.baidu.com/index/tbwise/forum',
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari/604.1'
        };
        let allTiebas = [];
        let pn = 1;
        while (true) {
            const response = yield withRetry(() => __awaiter(this, void 0, void 0, function* () {
                var _a;
                const res = yield axios_1.default.get(`https://tieba.baidu.com/mo/q/newmoindex?pn=${pn}`, { headers });
                if (!res.data || res.data.error !== 'success') {
                    throw new Error(`获取贴吧列表失败: ${((_a = res.data) === null || _a === void 0 ? void 0 : _a.error_msg) || '未知错误'}`);
                }
                return res;
            }), `获取贴吧列表 第${pn}页`);
            console.log(`🔍 第${pn}页响应:`, JSON.stringify(response.data).substring(0, 300));
            const forumList = response.data.forum_list;
            const pageList = [
                ...((forumList === null || forumList === void 0 ? void 0 : forumList['non-gconforum']) || []),
                ...((forumList === null || forumList === void 0 ? void 0 : forumList.gconforum) || [])
            ];
            allTiebas = allTiebas.concat(pageList);
            console.log(`🔍 第${pn}页获取 ${pageList.length} 个贴吧，累计 ${allTiebas.length} 个`);
            if (pageList.length < 200)
                break;
            pn++;
            yield sleep(500);
        }
        console.log(`📋 获取贴吧列表完成，共 ${allTiebas.length} 个贴吧`);
        return allTiebas;
    });
}
/**
 * 获取TBS参数
 * @param bduss - 百度BDUSS
 * @returns tbs参数
 */
function getTbs(bduss) {
    return __awaiter(this, void 0, void 0, function* () {
        return withRetry(() => __awaiter(this, void 0, void 0, function* () {
            const url = 'http://tieba.baidu.com/dc/common/tbs';
            const headers = {
                'Cookie': `BDUSS=${bduss}`,
                'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari/604.1'
            };
            const response = yield axios_1.default.get(url, {
                headers: headers
            });
            if (!response.data || !response.data.tbs) {
                throw new Error('获取tbs失败');
            }
            return response.data.tbs;
        }), '获取TBS参数');
    });
}
/**
 * 签到单个贴吧
 * @param bduss - 百度BDUSS
 * @param tiebaName - 贴吧名称
 * @param tbs - 签到所需的tbs参数
 * @param index - 贴吧索引号
 * @returns 签到结果
 */
function signTieba(bduss, tiebaName, tbs, index) {
    return __awaiter(this, void 0, void 0, function* () {
        return withRetry(() => __awaiter(this, void 0, void 0, function* () {
            const url = 'https://tieba.baidu.com/sign/add';
            const headers = {
                'Cookie': `BDUSS=${bduss}`,
                'Accept': 'application/json, text/javascript, */*; q=0.01',
                'Accept-Encoding': 'gzip,deflate,br',
                'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6',
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'Connection': 'keep-alive',
                'Host': 'tieba.baidu.com',
                'Referer': 'https://tieba.baidu.com/',
                'x-requested-with': 'XMLHttpRequest',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/84.0.4147.135 Safari/537.36 Edg/84.0.522.63'
            };
            const data = {
                tbs: tbs,
                kw: tiebaName,
                ie: 'utf-8'
            };
            const response = yield axios_1.default.post(url, (0, utils_1.toQueryString)(data), {
                headers: headers
            });
            if (!response.data) {
                throw new Error('签到响应数据为空');
            }
            return response.data;
        }), `签到操作`);
    });
}
