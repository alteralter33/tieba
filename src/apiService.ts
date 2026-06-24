/**
 * 百度贴吧API服务
 * 包含与百度贴吧API通信的核心功能
 */
import axios from 'axios';
import type { AxiosResponse, AxiosError } from 'axios';
import { toQueryString, generateDeviceId } from './utils';
import { 
  UserInfo, 
  TiebaInfo, 
  TiebaList, 
  SignResult, 
  TbsResult 
} from './types/apiService.types';

// 辅助函数：延时等待
const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

// 全局配置
const MAX_RETRIES = 3;           // 最大重试次数
const RETRY_DELAY = 3000;        // 重试延迟(ms)
const RETRY_MULTIPLIER = 2;      // 重试延迟倍数

/**
 * 带重试机制的请求函数
 * @param requestFn - 请求函数
 * @param operationName - 操作名称
 * @param maxRetries - 最大重试次数
 * @param initialDelay - 初始延迟(ms)
 * @param delayMultiplier - 延迟倍数
 * @returns 请求结果
 */
async function withRetry<T>(
  requestFn: () => Promise<T>, 
  operationName: string, 
  maxRetries: number = MAX_RETRIES, 
  initialDelay: number = RETRY_DELAY, 
  delayMultiplier: number = RETRY_MULTIPLIER
): Promise<T> {
  let retries = 0;
  let delay = initialDelay;
  
  while (true) {
    try {
      return await requestFn();
    } catch (error) {
      retries++;
      
      const axiosError = error as AxiosError;
      
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
      } else {
        delay = delay * delayMultiplier;
        console.warn(`⏳ ${operationName}失败，将在 ${delay}ms 后重试 (${retries}/${maxRetries})...`);
      }
      
      await sleep(delay);
    }
  }
}

/**
 * 验证BDUSS是否有效并获取用户信息
 * @param bduss - 百度BDUSS
 * @returns 用户信息
 */
export async function login(bduss: string): Promise<UserInfo> {
  return withRetry(async () => {
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
    
    const response = await axios.get(url, {
      headers: headers
    });
    
    if (!response.data || response.data.no !== 0 || response.data.error !== 'success') {
      throw new Error('验证BDUSS失败，可能已过期');
    }
    
    const userId = response.data.data.user_id;
    
    const userInfo: UserInfo = {
      status: 200,
      bduss: bduss,
      userId: userId,
      isValid: true,
      deviceId: generateDeviceId()
    };
    
    console.log('🔐 验证BDUSS成功');
    return userInfo;
  }, '验证BDUSS');
}

/**
 * 获取用户关注的贴吧列表及TBS
 * @param bduss - 百度BDUSS
 * @returns 贴吧列表和TBS
 */
export async function getTiebaList(bduss: string): Promise<TiebaList> {
  const headers = {
    'Cookie': `BDUSS=${bduss}`,
    'Referer': 'https://tieba.baidu.com/',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/84.0.4147.135 Safari/537.36'
  };

  let allTiebas: TiebaList = [];
  let pn = 1;

  while (true) {
    const response = await withRetry(async () => {
      const res = await axios.get(
        `https://tieba.baidu.com/f/like/mylike?pn=${pn}&rn=200&ie=utf-8`,
        { headers }
      );
      if (!res.data || res.data.no !== 0) {
        throw new Error(`获取贴吧列表失败: ${res.data?.error_msg || '未知错误'}`);
      }
      return res;
    }, `获取贴吧列表 第${pn}页`);

    const pageList: TiebaList = response.data.data?.like_forum || [];
    allTiebas = allTiebas.concat(pageList);
    console.log(`🔍 第${pn}页获取 ${pageList.length} 个贴吧，累计 ${allTiebas.length} 个`);

    if (pageList.length < 200) break;
    pn++;
    await sleep(500);
  }

  console.log(`📋 获取贴吧列表完成，共 ${allTiebas.length} 个贴吧`);
  return allTiebas;
}

/**
 * 获取TBS参数
 * @param bduss - 百度BDUSS
 * @returns tbs参数
 */
export async function getTbs(bduss: string): Promise<string> {
  return withRetry(async () => {
    const url = 'http://tieba.baidu.com/dc/common/tbs';
    const headers = {
      'Cookie': `BDUSS=${bduss}`,
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari/604.1'
    };
    
    const response = await axios.get<TbsResult>(url, {
      headers: headers
    });
    
    if (!response.data || !response.data.tbs) {
      throw new Error('获取tbs失败');
    }
    
    return response.data.tbs;
  }, '获取TBS参数');
}

/**
 * 签到单个贴吧
 * @param bduss - 百度BDUSS
 * @param tiebaName - 贴吧名称
 * @param tbs - 签到所需的tbs参数
 * @param index - 贴吧索引号
 * @returns 签到结果
 */
export async function signTieba(bduss: string, tiebaName: string, tbs: string, index: number): Promise<SignResult> {
  return withRetry(async () => {
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
    
    const response = await axios.post<SignResult>(url, toQueryString(data), {
      headers: headers
    });
    
    if (!response.data) {
      throw new Error('签到响应数据为空');
    }
    
    return response.data;
  }, `签到操作`);
} 
