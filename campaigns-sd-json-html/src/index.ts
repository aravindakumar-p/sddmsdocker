import { defineDisplay } from '@directus/extensions-sdk';
import DisplayComponent from './display.vue';

export default defineDisplay({
	id: 'sd-json-html',
	name: 'SD Json Html',
	icon: 'box',
	description: 'This is my custom display!',
	component: DisplayComponent,
    options: [
        {
            field: 'html_str',
            name: 'Html String',
            type: 'string',
            meta: {
                width: 'full',
                interface: 'input-code',
                options: {
                    language:'htmlmixed',
                    lineNumber: true
                }
            }
        }
    ],
	types: ['string', 'text'],
});
