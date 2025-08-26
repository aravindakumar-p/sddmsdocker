import * as Excel from 'exceljs';

export default class generateExcel {
	rewardLinkToExcel = async (items: any) => {
		try {
			/* Checking for Work Advantage */
			const workbook = new Excel.Workbook();
			const worksheet = workbook.addWorksheet('Sheet 1');

			// Add headers to worksheet
			worksheet.columns = [
				{ header: 'Link', key: 'link' },
				{ header: 'Value', key: 'value' },
				{ header: 'Otp', key: 'otp' },
				{ header: 'First Name', key: 'first_name' },
				{ header: 'Last Name', key: 'last_name' },
				{ header: 'Mobile Number', key: 'phone' },
				{ header: 'Email', key: 'email' },
			];

			worksheet.addRows(items);

			return workbook;
		} catch (e) {
			return null;
		}
	};
}
