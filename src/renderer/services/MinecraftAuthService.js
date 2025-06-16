/**
 * Minecraft身份验证服务
 * 处理Microsoft OAuth登录、Xbox Live验证和Minecraft账户信息获取
 */

import axios from 'axios';
import { logger } from './Logger.js';

/**
 * Microsoft/Minecraft身份验证服务
 * 实现完整的OAuth流程和各API调用
 */
class MinecraftAuthService {
  /**
   * 使用授权码获取Microsoft访问令牌
   * @param {string} authCode - 从OAuth流程获取的授权码
   * @returns {Promise<Object>} 包含访问令牌和刷新令牌的对象
   */
  async getMicrosoftToken(authCode) {
    try {
      const clientId = "00000000402b5328"; // Minecraft官方客户端ID
      const redirectUrl = "https://login.live.com/oauth20_desktop.srf";

      logger.debug(`准备获取Microsoft令牌，授权码前10个字符: ${authCode.substring(0, 10)}...`);      const response = await axios.post('https://login.live.com/oauth20_token.srf', 
        new URLSearchParams({
          client_id: clientId,
          code: authCode,
          grant_type: 'authorization_code',
          redirect_uri: redirectUrl,
          scope: 'XboxLive.signin offline_access'
        }), {
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
      logger.error('获取Microsoft令牌失败:', error);
      throw new Error(`获取Microsoft令牌失败: ${error.response?.data?.error_description || error.message}`);
    }
  }

  /**
   * Xbox Live身份验证
   * @param {string} msAccessToken - Microsoft访问令牌
   * @returns {Promise<Object>} Xbox Live身份验证结果
   */
  async authenticateWithXboxLive(msAccessToken) {
    try {
      // 第一次尝试，带d=前缀
      let response;
      try {
        response = await axios.post('https://user.auth.xboxlive.com/user/authenticate', {
          Properties: {
            AuthMethod: 'RPS',
            SiteName: 'user.auth.xboxlive.com',
            RpsTicket: `d=${msAccessToken}`
          },
          RelyingParty: 'http://auth.xboxlive.com',
          TokenType: 'JWT'
        }, {
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          }
        });
      } catch (error) {
        // 如果遇到400 Bad Request，去掉d=重试
        if (error.response && error.response.status === 400) {
          logger.warn('Xbox Live身份验证遇到400，尝试去掉d=前缀重试');
          response = await axios.post('https://user.auth.xboxlive.com/user/authenticate', {
            Properties: {
              AuthMethod: 'RPS',
              SiteName: 'user.auth.xboxlive.com',
              RpsTicket: msAccessToken
            },
            RelyingParty: 'http://auth.xboxlive.com',
            TokenType: 'JWT'
          }, {
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            }
          });
        } else {
          throw error;
        }
      }
      return {
        token: response.data.Token,
        userHash: response.data.DisplayClaims.xui[0].uhs
      };    } catch (error) {
      logger.error('Xbox Live身份验证失败:', error);
      throw new Error(`Xbox Live身份验证失败: ${error.response?.data?.error || error.message}`);
    }
  }

  /**
   * XSTS身份验证
   * @param {string} xboxLiveToken - Xbox Live令牌
   * @returns {Promise<Object>} XSTS身份验证结果
   */
  async getXSTSToken(xboxLiveToken) {
    try {
      const response = await axios.post('https://xsts.auth.xboxlive.com/xsts/authorize', {
        Properties: {
          SandboxId: 'RETAIL',
          UserTokens: [xboxLiveToken]
        },
        RelyingParty: 'rp://api.minecraftservices.com/',
        TokenType: 'JWT'
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      });

      return {
        token: response.data.Token,
        userHash: response.data.DisplayClaims.xui[0].uhs
      };
    } catch (error) {
      // 检查特定的XSTS错误
      if (error.response?.status === 401) {
        const xErr = error.response.data.XErr;
        if (xErr === 2148916233) {
          throw new Error('无法登录：您的Microsoft账户存在，但没有Xbox账户。请先创建一个Xbox账户。');
        } else if (xErr === 2148916238) {
          throw new Error('无法登录：您的账户来自不允许使用Xbox Live的国家/地区。');
        }      }
      
      logger.error('获取XSTS令牌失败:', error);
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
      logger.error('获取Minecraft令牌失败:', error);
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
      logger.error('检查游戏所有权失败:', error);
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
      
      logger.error('获取Minecraft个人资料失败:', error);
      throw new Error(`获取Minecraft个人资料失败: ${error.response?.data?.error || error.message}`);
    }
  }
  
  /**
   * 完整的Microsoft登录流程
   * @param {string} authCode - 授权码
   * @returns {Promise<Object>} 完整的账号信息
   */
  async completeLoginProcess(authCode) {
    try {
      // 1. 获取Microsoft访问令牌
      const msTokenData = await this.getMicrosoftToken(authCode);
      
      // 2. 使用Microsoft令牌进行Xbox Live身份验证
      const xboxLiveData = await this.authenticateWithXboxLive(msTokenData.accessToken);
      
      // 3. 获取XSTS令牌
      const xstsData = await this.getXSTSToken(xboxLiveData.token);
      
      // 4. 获取Minecraft访问令牌
      const minecraftTokenData = await this.getMinecraftToken(xstsData.token, xstsData.userHash);
      
      // 5. 检查游戏所有权
      const ownsGame = await this.checkGameOwnership(minecraftTokenData.accessToken);
      
      if (!ownsGame) {
        throw new Error('该Microsoft账户未拥有Minecraft，请购买游戏后再试。');
      }
      
      // 6. 获取Minecraft个人资料
      const profile = await this.getMinecraftProfile(minecraftTokenData.accessToken);
      
      if (!profile) {
        throw new Error('无法获取Minecraft个人资料，可能需要创建游戏角色。');
      }
      
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
      
      return account;    } catch (error) {
      logger.error('完整登录流程失败:', error);
      throw error;
    }
  }
}

export default new MinecraftAuthService();
