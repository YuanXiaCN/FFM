/**
 * Minecraft身份验证服务 - 主进程版本
 * 处理Microsoft OAuth登录、Xbox Live验证和Minecraft账户信息获取
 */

// 使用CommonJS语法，因为这是在Electron主进程中使用的
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { logger } = require('./utils.cjs');

/**
 * 记录日志到文件 (兼容旧版本，推荐使用logger)
 * @param {string} message - 要记录的消息
 */
function logToFile(message) {
    logger.info(message);
}

const CLIENT_ID = "00000000402b5328"; // Minecraft官方客户端ID
const REDIRECT_URL = "https://login.live.com/oauth20_desktop.srf";

/**
 * Microsoft/Minecraft身份验证服务
 * 实现完整的OAuth流程和各API调用
 */
class MinecraftAuthService {  /**
   * 使用授权码获取Microsoft访问令牌
   * @param {string} authCode - 从OAuth流程获取的授权码
   * @returns {Promise<Object>} 包含访问令牌和刷新令牌的对象
   */    async getMicrosoftToken(authCode) {    try {
      logger.debug(`准备获取Microsoft令牌，授权码前10个字符: ${authCode.substring(0, 10)}...`);
      
      const params = new URLSearchParams({
        client_id: CLIENT_ID,
        code: authCode,
        grant_type: 'authorization_code',
        redirect_uri: REDIRECT_URL,
        scope: 'XboxLive.signin offline_access'
      });
      
      logger.debug(`发送Microsoft令牌请求`, { 
        client_id: CLIENT_ID, 
        grant_type: 'authorization_code', 
        redirect_uri: REDIRECT_URL,
        scope: 'XboxLive.signin offline_access'
      });
      
      const response = await axios.post('https://login.live.com/oauth20_token.srf', 
        params.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });
      
      logger.info('成功获取Microsoft令牌');
      
      return {
        accessToken: response.data.access_token,
        refreshToken: response.data.refresh_token,
        expiresIn: response.data.expires_in
      };
    } catch (error) {
      // 详细记录错误信息
      if (error.response) {
        logger.error(`获取Microsoft令牌失败 - 状态码: ${error.response.status}`);
        logger.error(`错误详情`, error.response.data || {});
      } else if (error.request) {
        logger.error('获取Microsoft令牌请求失败 - 无响应');
      }
      
      logger.error(`获取Microsoft令牌失败: ${error.response?.data?.error_description || error.message}`);
      throw new Error(`获取Microsoft令牌失败: ${error.response?.data?.error_description || error.message}`);
    }
  }
  /**
   * Xbox Live身份验证
   * @param {string} msAccessToken - Microsoft访问令牌
   * @returns {Promise<Object>} Xbox Live身份验证结果
   */  async authenticateWithXboxLive(msAccessToken) {
    try {
      // 记录详细日志
      logger.debug(`准备进行Xbox Live身份验证，令牌前10个字符: ${msAccessToken.substring(0, 10)}...`);
      let response;
      try {
        // 第一次尝试，带d=前缀
        const payload = {
          Properties: {
            AuthMethod: 'RPS',
            SiteName: 'user.auth.xboxlive.com',
            RpsTicket: `d=${msAccessToken}`
          },
          RelyingParty: 'http://auth.xboxlive.com',
          TokenType: 'JWT'
        };
        logger.debug(`发送Xbox Live身份验证请求（带d=）`, payload);
        response = await axios.post('https://user.auth.xboxlive.com/user/authenticate', payload, {
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          }
        });
      } catch (error) {
        // 如果遇到400 Bad Request，去掉d=重试
        if (error.response && error.response.status === 400) {
          logger.warn('Xbox Live身份验证遇到400，尝试去掉d=前缀重试');
          const payload = {
            Properties: {
              AuthMethod: 'RPS',
              SiteName: 'user.auth.xboxlive.com',
              RpsTicket: msAccessToken
            },
            RelyingParty: 'http://auth.xboxlive.com',
            TokenType: 'JWT'
          };
          logger.debug(`发送Xbox Live身份验证请求（无d=）`, payload);
          response = await axios.post('https://user.auth.xboxlive.com/user/authenticate', payload, {
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            }
          });
        } else {
          throw error;
        }
      }
      logger.info('Xbox Live身份验证成功');
      
      return {
        token: response.data.Token,
        userHash: response.data.DisplayClaims.xui[0].uhs
      };
    } catch (error) {
      // 详细记录错误信息
      if (error.response) {
        logger.error(`Xbox Live身份验证失败 - 状态码: ${error.response.status}`);
        logger.error(`错误详情`, error.response.data || {});
      } else if (error.request) {
        logger.error(`Xbox Live身份验证请求失败 - 无响应`);
      }
      logger.error(`Xbox Live身份验证失败: ${error.response?.data?.error || error.message}`);
      throw new Error(`Xbox Live身份验证失败: ${error.response?.data?.error || error.message}`);
    }
  }
  /**
   * XSTS身份验证
   * @param {string} xboxLiveToken - Xbox Live令牌
   * @returns {Promise<Object>} XSTS身份验证结果
   */
  async getXSTSToken(xboxLiveToken) {    try {
      // 记录详细日志
      logger.debug(`准备获取XSTS令牌，Xbox Live令牌前10个字符: ${xboxLiveToken.substring(0, 10)}...`);
      
      // 确保使用正确的格式
      const payload = {
        Properties: {
          SandboxId: 'RETAIL',
          UserTokens: [xboxLiveToken]
        },
        RelyingParty: 'rp://api.minecraftservices.com/',
        TokenType: 'JWT'
      };
      
      logger.debug(`发送XSTS身份验证请求`, payload);
      
      const response = await axios.post('https://xsts.auth.xboxlive.com/xsts/authorize', payload, {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      });
        logger.info('成功获取XSTS令牌');
      
      return {
        token: response.data.Token,
        userHash: response.data.DisplayClaims.xui[0].uhs
      };
    } catch (error) {
      // 详细记录错误信息
      if (error.response) {
        logger.error(`XSTS身份验证失败 - 状态码: ${error.response.status}`);
        logger.error(`错误详情`, error.response.data || {});
        
        // 检查特定的XSTS错误
        if (error.response.status === 401) {
          const xErr = error.response.data.XErr;
          if (xErr === 2148916233) {
            const errorMsg = '无法登录：您的Microsoft账户存在，但没有Xbox账户。请先创建一个Xbox账户。';
            logger.error(errorMsg);
            throw new Error(errorMsg);
          } else if (xErr === 2148916238) {
            const errorMsg = '无法登录：您的账户来自不允许使用Xbox Live的国家/地区。';
            logger.error(errorMsg);
            throw new Error(errorMsg);
          }
        }
      } else if (error.request) {
        logger.error(`XSTS身份验证请求失败 - 无响应`);
      }
      
      logger.error(`获取XSTS令牌失败: ${error.response?.data?.error || error.message}`);
      throw new Error(`获取XSTS令牌失败: ${error.response?.data?.error || error.message}`);
    }
  }

  /**
   * 获取Minecraft访问令牌
   * @param {string} xstsToken - XSTS令牌
   * @param {string} userHash - 用户哈希值
   * @returns {Promise<Object>} Minecraft访问令牌
   */
  async getMinecraftToken(xstsToken, userHash) {
    try {
      const response = await axios.post('https://api.minecraftservices.com/authentication/login_with_xbox', {
        identityToken: `XBL3.0 x=${userHash};${xstsToken}`
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      });

      return {
        accessToken: response.data.access_token,
        tokenType: response.data.token_type,
        expiresIn: response.data.expires_in
      };    } catch (error) {
      logger.error(`获取Minecraft令牌失败: ${error.response?.data?.error || error.message}`);
      throw new Error(`获取Minecraft令牌失败: ${error.response?.data?.error || error.message}`);
    }
  }

  /**
   * 检查是否拥有Minecraft游戏
   * @param {string} minecraftToken - Minecraft访问令牌
   * @returns {Promise<boolean>} 是否拥有游戏
   */
  async checkGameOwnership(minecraftToken) {
    try {
      const response = await axios.get('https://api.minecraftservices.com/entitlements/mcstore', {
        headers: {
          'Authorization': `Bearer ${minecraftToken}`
        }
      });

      // 检查是否拥有Minecraft
      return response.data.items && response.data.items.length > 0;    } catch (error) {
      logger.error(`检查游戏所有权失败: ${error.response?.data?.error || error.message}`);
      throw new Error(`检查游戏所有权失败: ${error.response?.data?.error || error.message}`);
    }
  }

  /**
   * 获取Minecraft个人资料
   * @param {string} minecraftToken - Minecraft访问令牌
   * @returns {Promise<Object>} 玩家信息
   */
  async getMinecraftProfile(minecraftToken) {
    try {
      const response = await axios.get('https://api.minecraftservices.com/minecraft/profile', {
        headers: {
          'Authorization': `Bearer ${minecraftToken}`
        }
      });

      return {
        uuid: response.data.id,
        username: response.data.name,
        skins: response.data.skins || [],
        capes: response.data.capes || []
      };
    } catch (error) {
      // 如果返回404，可能表示用户没有购买游戏或需要创建角色
      if (error.response?.status === 404) {
        return null;      }
      
      logger.error(`获取Minecraft个人资料失败: ${error.response?.data?.error || error.message}`);
      throw new Error(`获取Minecraft个人资料失败: ${error.response?.data?.error || error.message}`);
    }
  }
  
  /**
   * 完整的Microsoft登录流程
   * @param {string} authCode - 授权码
   * @returns {Promise<Object>} 完整的账号信息
   */  async completeLoginProcess(authCode) {
    try {
      logger.info(`开始处理Microsoft登录流程，授权码: ${authCode.substring(0, 5)}...`);
      
      // 1. 获取Microsoft访问令牌
      logger.info('正在获取Microsoft访问令牌...');
      const msTokenData = await this.getMicrosoftToken(authCode);
      logger.info('成功获取Microsoft访问令牌');
      
      // 2. 使用Microsoft令牌进行Xbox Live身份验证
      logger.info('正在进行Xbox Live身份验证...');
      const xboxLiveData = await this.authenticateWithXboxLive(msTokenData.accessToken);
      logger.info('成功完成Xbox Live身份验证');
      
      // 3. 获取XSTS令牌
      logger.info('正在获取XSTS令牌...');
      const xstsData = await this.getXSTSToken(xboxLiveData.token);
      logger.info('成功获取XSTS令牌');
      
      // 4. 获取Minecraft访问令牌
      logger.info('正在获取Minecraft访问令牌...');
      const minecraftTokenData = await this.getMinecraftToken(xstsData.token, xstsData.userHash);
      logger.info('成功获取Minecraft访问令牌');
      
      // 5. 检查游戏所有权
      logger.info('正在检查游戏所有权...');
      const ownsGame = await this.checkGameOwnership(minecraftTokenData.accessToken);
      
      if (!ownsGame) {
        const errorMsg = '该Microsoft账户未拥有Minecraft，请购买游戏后再试。';
        logger.error(errorMsg);
        throw new Error(errorMsg);
      }
      logger.info('确认账户拥有Minecraft');
      
      // 6. 获取Minecraft个人资料
      logger.info('正在获取Minecraft个人资料...');
      const profile = await this.getMinecraftProfile(minecraftTokenData.accessToken);
      
      if (!profile) {
        const errorMsg = '无法获取Minecraft个人资料，可能需要创建游戏角色。';
        logger.error(errorMsg);
        throw new Error(errorMsg);
      }
      logger.info(`成功获取Minecraft个人资料: ${profile.username}`);
      
      // 7. 构建完整的账号对象
      const account = {
        id: Date.now().toString(),
        type: 'Microsoft',
        username: profile.username,
        uuid: profile.uuid,
        accessToken: minecraftTokenData.accessToken,
        refreshToken: msTokenData.refreshToken, // Microsoft的刷新令牌
        clientId: "00000000402b5328",
        expiresAt: Date.now() + (minecraftTokenData.expiresIn * 1000),
        addedTime: Date.now()
      };
      
      // 如果玩家有皮肤，添加皮肤URL
      if (profile.skins && profile.skins.length > 0) {
        const activeSkin = profile.skins.find(skin => skin.state === 'ACTIVE');
        if (activeSkin) {
          account.avatar = activeSkin.url;
        }
      }
      
      logger.info(`登录流程完成，账号信息`, { 
        username: account.username,
        uuid: account.uuid,
        type: account.type
      });
        return account;
    } catch (error) {
      logger.error(`登录流程失败: ${error.message}`);
      throw error;
    }
  }
  /**
   * 使用刷新令牌获取新的Microsoft访问令牌
   * @param {string} refreshToken - Microsoft刷新令牌
   * @returns {Promise<Object>} 包含新的访问令牌和刷新令牌的对象
   */  async refreshMicrosoftToken(refreshToken) {
    try {
      logger.debug(`正在刷新Microsoft访问令牌，刷新令牌前10个字符: ${refreshToken.substring(0, 10)}...`);
      
      const params = new URLSearchParams({
        client_id: CLIENT_ID,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
        redirect_uri: REDIRECT_URL,
        scope: 'XboxLive.signin offline_access'
      });
      
      logger.debug(`发送令牌刷新请求`, { 
        client_id: CLIENT_ID, 
        grant_type: 'refresh_token', 
        redirect_uri: REDIRECT_URL,
        scope: 'XboxLive.signin offline_access'
      });
      
      const response = await axios.post('https://login.live.com/oauth20_token.srf', 
        params.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      logger.info('成功刷新Microsoft访问令牌');
      
      return {
        accessToken: response.data.access_token,
        refreshToken: response.data.refresh_token || refreshToken, // 某些情况下可能不返回新的刷新令牌
        expiresIn: response.data.expires_in
      };
    } catch (error) {
      // 详细记录错误信息
      if (error.response) {
        logger.error(`刷新Microsoft令牌失败 - 状态码: ${error.response.status}`);
        logger.error(`错误详情`, error.response.data || {});
      } else if (error.request) {
        logger.error('刷新Microsoft令牌请求失败 - 无响应');
      }
      
      logger.error(`刷新Microsoft令牌失败: ${error.response?.data?.error_description || error.message}`);
      throw new Error(`刷新Microsoft令牌失败: ${error.response?.data?.error_description || error.message}`);
    }
  }
  
  /**
   * 更新Minecraft账号的访问令牌
   * @param {Object} account - Minecraft账号对象
   * @returns {Promise<Object>} 更新后的账号对象
   */  async refreshAccount(account) {
    try {
      if (!account.refreshToken) {
        throw new Error('账号没有刷新令牌，无法更新');
      }
      
      logger.info(`开始更新账号 ${account.username || 'unknown'} 的令牌`);
      
      // 1. 使用刷新令牌获取新的Microsoft访问令牌
      const msTokenData = await this.refreshMicrosoftToken(account.refreshToken);
      
      // 2. 使用Microsoft令牌进行Xbox Live身份验证
      const xboxLiveData = await this.authenticateWithXboxLive(msTokenData.accessToken);
      
      // 3. 获取XSTS令牌
      const xstsData = await this.getXSTSToken(xboxLiveData.token);
      
      // 4. 获取Minecraft访问令牌
      const minecraftTokenData = await this.getMinecraftToken(xstsData.token, xstsData.userHash);
      
      // 5. 更新账号信息
      account.accessToken = minecraftTokenData.accessToken;
      account.refreshToken = msTokenData.refreshToken;
      account.expiresAt = Date.now() + (minecraftTokenData.expiresIn * 1000);
      
      logger.info(`成功更新账号 ${account.username || 'unknown'} 的令牌`);
      
      return account;
    } catch (error) {
      logger.error(`更新账号令牌失败: ${error.message}`);
      throw error;
    }
  }
}

module.exports = new MinecraftAuthService();
