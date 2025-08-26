import axios from "axios";
import LogSys from "../../helpers/logger";

const base_url = process.env.REWARD_ST_BASE_URL;
const client_id = process.env.REWARD_ST_CLIENT_ID;
const client_secret = process.env.REWARD_ST_CLIENT_SECRET;
const token = Buffer.from(`${client_id}:${client_secret}`).toString('base64');

const getBalance = async () => {
    try {
        const apiUrl = base_url + '/wallets';

        const headers = {
            connection: 'close',
            'content-type': 'application/json',
            Authorization: 'Basic ' + token
        };

        const response = await axios.get(apiUrl, { headers });

        return { success: true, balance: response.data };
    } catch (e) {
        return { success: false, error: e };
    }
}
const getProducts = async () => {
    try {
        const apiUrl = base_url + '/products';
        const params = {
            limit: 10000,
            filters: {
                "category": "Gift Card",
            }
        }
        const headers = {
            connection: 'close',
            'content-type': 'application/json',
            Authorization: 'Basic ' + token
        };

        const response = await axios.get(apiUrl, { headers, params: params });
        return response.data
    } catch (error) {
        await new LogSys().jsonError({
            exception: error,
            error: 'Reward Store getProduct Error',
        }, null, null);
        return null;
    }

}

const orderPlace = async (productId: any, deno: any, quantity: any, ref_code: any , vendor_code : any) => {
    try {
        await new LogSys().log('get Reward Store Voucher Initialising', false, ref_code, vendor_code);
        const apiUrl = base_url + '/orders';
        const headers = {
            connection: 'close',
            'content-type': 'application/json',
            Authorization: 'Basic ' + token
        };
        const body = {
            "product_id": productId,
            "denomination": deno,
            "quantity": quantity,
            "reference_code": ref_code
        }

        const orderData = await axios.post(apiUrl, body, {
            headers: headers
        })
        const { id, status, vouchers, message } = orderData.data

        let success = status == 'DELIVERED' || status == 'PENDING';
        let voucher = vouchers.map((card : any) =>  {
            return {
                cardnumber: card['card_number'],
                pin_or_url: card['pin_code'],
                expiry: card['expire_date'],
            }
        });


        return { vouchers : voucher, success, message, orderID: id, status ,statusCode: orderData.status}

    } catch (err) {
        await new LogSys().jsonError(
            {
                exception: err,
                error: 'getQCVoucher Error',
                referenceId : ref_code,
            },
            ref_code,
            vendor_code
         
        );
        return {
            vouchers: null,
            success: false,
            message: 'Exception Occurred:' + err,
            exception: true,
            orderId: null,
            ref_code
        };

    }

}

export default {
    getBalance,
    getProducts,
    orderPlace
}