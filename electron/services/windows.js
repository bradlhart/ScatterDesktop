const ApiActions = require("@walletpack/core/models/api/ApiActions");
const AppsService = require("@walletpack/core/services/apps/AppsService").default;
const StoreService = require('@walletpack/core/services/utility/StoreService').default;

StoreService.init({
	state:{
		dappData:{},
	}
});

AppsService.getApps([], false).then(dappData => {
	StoreService.get().state.dappData = dappData;
})

const electron = require('electron');
const {Menu, BrowserWindow} = electron;
const {mainUrl} = require('../utils')

const isMac = () => process.platform === 'darwin';


let popouts = [];

let waitingPopup;
class LowLevelWindowService {

	static getWindow(width = 800, height = 600){
		return new Promise(resolve => {
			const win = new BrowserWindow({
				backgroundColor:'#FFFFFF',
				width, height,
				frame: false, radii: [5,5,5,5],
				icon:'assets/icon.png',
				show:false,
				webPreferences:{
					nodeIntegration:true,
					webviewTag:true,
				} });
			win.loadURL(mainUrl(true));
			// win.loadURL('http://localhost:8081/#/popout');
			resolve(win)
			// win.once('ready-to-show', () => resolve(win));
		})
	}

	static async queuePopup(){
		setTimeout(async () => {
			waitingPopup = await this.getWindow(800,600);
		}, 100);
	}

	static dimensions(popup){
		switch (popup.data.type) {
			case ApiActions.LOGIN:
			case ApiActions.LOGIN_ALL:
			case ApiActions.GET_PUBLIC_KEY:
			case ApiActions.TRANSFER:
				return {width:600, height:600};
			case ApiActions.UPDATE_IDENTITY:
				return {width:420, height:600};
			case ApiActions.SIGN:
				return {width:920, height:600};
			case 'linkApp':
				return {width:420, height:500};
			default:
				return {width:800, height:600};
		}
	}

	static async openPopOutFromPopupOnly(popup){
		return new Promise((resolve) => {
			let responded = false;
			const respond = result => {
				responded = true;
				popouts = popouts.filter(x => x.id !== popup.id);
				resolve(Object.assign(popup, {result}));
			};

			popup.resolver = respond;

			// Rate limiting: One open pop out at a time per origin.
			if(popouts.find(x => x.data.props.payload.origin === popup.data.props.payload.origin)){
				return resolve(false);
			}


			// TODO: This should now be done on the web app
			popup.data.props.appData = AppsService.getAppData(popup.data.props.payload.origin);

			popouts.push(popup);

			const {width, height} = LowLevelWindowService.dimensions(popup);
			const win = LowLevelWindowService.openPopOut(
				popup,
				() /* closed without action */ => { if(!responded) respond(null); },
				width, height,
				popup.internal
			);

		})
	}

	static async openPopOut(popup, onClosed = () => {}, width = 800, height = 600, dontHide = false){
		let win = waitingPopup;
		if(!win) win = await this.getWindow();
		else waitingPopup = null;

		win.webContents.send('popout', popup);

		win.setSize(width, height);

		// Getting the screen to display the popup based on
		// where the user is at the time ( for dual monitors )
		const mousePoint = electron.screen.getCursorScreenPoint();
		const activeDisplay = electron.screen.getDisplayNearestPoint(mousePoint);
		let {width:screenWidth, height:screenHeight} = activeDisplay.workAreaSize;
		const leftBound = activeDisplay.bounds.x;

		let bounds = electron.screen.getPrimaryDisplay().bounds;
		let x = bounds.x + (leftBound + ((bounds.width - width) / 2));
		let y = bounds.y + ((bounds.height - height) / 2);
		win.setPosition(Math.round(x),Math.round(y));

		win.once('closed', async () => {
			// This is a fix for MacOS systems which causes the
			// main window to always pop up after popups closing.
			if (!dontHide && isMac()) {
				// mainWindow.hide();
				Menu.sendActionToFirstResponder('hide:');
				// mainWindow.show();
			}

			onClosed(win);
			win = null;
		});

		this.queuePopup();

		win.show();
		win.setAlwaysOnTop(true, "floating");
		win.focus();



		if(isMac()){
			electron.app.dock.hide();
			win.setAlwaysOnTop(false);
			win.setVisibleOnAllWorkspaces(true);
			win.setFullScreenable(false);
			electron.app.dock.show();
		}

		return win;
	}
}

module.exports = LowLevelWindowService;
