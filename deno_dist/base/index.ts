import { PayPayError, isPassword, isPhone, isUuid } from '../index.ts'
import { createHeader } from '../headers/index.ts'
import type {
  LoginContext,
  OTP,
  ResponseBalance,
  ResponseBody,
  baseHeader,
  loginResult,
} from '../types.ts'
import { parseBalanceContext, parseCookieFromMap } from '../utils/parse.ts'

export class PayPay {
  phone: string = ''
  password: string = ''
  uuid: string | undefined
  token: string | undefined
  header: baseHeader = createHeader()
  cookie = new Map<string, string>()

  // is Logged
  logged: boolean = false

  // one time password
  otp: OTP = {
    waiting: false,
    otp_prefix: '',
    otp_ref_id: '',
  }

  constructor(phone: string, password: string) {
    if (isPhone(phone)) {
      if (isPassword(password)) {
        this.phone = phone
        this.password = password
      } else {
        new PayPayError('Password is not valid', 0)
      }
    } else {
      new PayPayError('Phone is not valid', 0)
    }
  }

  async login({ uuid, token }: LoginContext = {}): Promise<loginResult> {
    if (this.isLogged()) {
      return {
        success: true,
        status: 'LoginAlreadySuccess',
      }
    }

    if (token) {
      this.token = token
      this.logged = true
      this.cookie.set('token', token)
      return {
        success: true,
        status: 'LoginSuccess',
      }
    }

    if (uuid) {
      if (isUuid(uuid)) {
        this.uuid = uuid
      } else {
        new PayPayError('UUID is not valid', 0)
        return {
          success: false,
          status: 'LoginFailed',
        }
      }
    } else {
      this.uuid = crypto.randomUUID()
    }

    const ctx = {
      scope: 'SIGN_IN',
      client_uuid: this.uuid,
      grant_type: 'password',
      username: this.phone,
      password: this.password,
      add_otp_prefix: true,
      language: 'ja',
    }

    const response = await fetch('https://www.paypay.ne.jp/app/v1/oauth/token', {
      method: 'POST',
      headers: this.header,
      body: JSON.stringify(ctx),
    })

    const result: ResponseBody = await response.json()

    if ('access_token' in result) {
      this.token = result.access_token
      this.logged = true
      this.cookie.set('token', result.access_token)
      return {
        success: true,
        status: 'LoginSuccess',
      }
    } else {
      if (result['response_type'] === 'ErrorResponse') {
        return {
          success: false,
          status: 'LoginFailed',
        }
      } else {
        this.otp = {
          waiting: true,
          otp_prefix: result['otp_prefix'],
          otp_ref_id: result['otp_reference_id'],
        }
        return {
          success: false,
          status: 'LoginNeedOTP',
        }
      }
    }
  }

  isLogged(): boolean {
    return this.logged
  }

  async otpLogin(otp: string): Promise<loginResult> {
    if (this.otp.waiting) {
      const ctx = {
        scope: 'SIGN_IN',
        client_uuid: this.uuid,
        grant_type: 'otp',
        otp_prefix: this.otp.otp_prefix,
        otp: otp,
        otp_reference_id: this.otp.otp_ref_id,
        username_type: 'MOBILE',
        language: 'ja',
      }

      const response = await fetch('https://www.paypay.ne.jp/app/v1/oauth/token', {
        method: 'POST',
        headers: {
          ...this.header,
          'Content-Type': 'application/json',
          cookie: parseCookieFromMap(this.cookie),
        },
        body: JSON.stringify(ctx),
      })

      const result: ResponseBody = await response.json()

      if ('access_token' in result) {
        this.token = result.access_token
        this.logged = true
        this.cookie.set('token', result.access_token)
        return {
          success: true,
          status: 'LoginSuccess',
        }
      } else {
        return {
          success: false,
          status: 'LoginFailOTP',
        }
      }
    } else {
      if (this.isLogged()) {
        return {
          success: true,
          status: 'LoginAlreadySuccess',
        }
      } else {
        return {
          success: false,
          status: 'LoginFailed',
        }
      }
    }
  }

  getUuid(): string | undefined {
    if (this.uuid) {
      return this.uuid
    } else {
      new PayPayError('Not logged in yet.', 0)
    }
  }

  async getBalance(): Promise<ResponseBalance | undefined> {
    const response = await fetch('https://www.paypay.ne.jp/app/v1/bff/getBalanceInfo', {
      method: 'GET',
      headers: {
        ...this.header,
        cookie: parseCookieFromMap(this.cookie),
      },
    })

    if (!response.ok) {
      return undefined
    }

    const result = await response.json()

    return parseBalanceContext(result)
  }
}
