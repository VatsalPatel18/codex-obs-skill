import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

const card = '/dev/v4l/by-id/usb-MACROSILICON_2109-video-index0';

export default class Ps5Screen extends Extension {
    enable() {
        this.button = new PanelMenu.Button(0.5, 'PS5 Screen');
        this.button.add_child(new St.Icon({
            icon_name: 'input-gaming-symbolic',
            style_class: 'system-status-icon',
        }));
        this.status = new PopupMenu.PopupMenuItem('', {reactive: false});
        this.button.menu.addMenuItem(this.status);
        this.show = this.button.menu.addAction('Show PS5 on monitor 2', () => this.showProjector());
        this.hide = this.button.menu.addAction('Use Ubuntu on monitor 2', () => {
            for (const window of this.findProjectors())
                window.minimize();
        });
        this.button.menu.connect('open-state-changed', (_menu, open) => {
            if (open)
                this.refresh();
        });
        Main.panel.addToStatusArea('ps5-screen', this.button);
        this.refresh();
    }

    findProjectors() {
        return global.get_window_actors().map(actor => actor.meta_window).filter(window => {
            const title = window.get_title() ?? '';
            const app = window.get_wm_class() ?? '';
            return /obs/i.test(app) && title.includes('Projector') && title.includes('PS5 HDMI');
        });
    }

    refresh() {
        const connected = GLib.file_test(card, GLib.FileTest.EXISTS);
        this.status.label.text = connected ? 'Capture card connected' : 'Capture card disconnected';
        this.show.setSensitive(connected);
        this.hide.setSensitive(this.findProjectors().some(window => !window.minimized));
    }

    showProjector() {
        if (!GLib.file_test(card, GLib.FileTest.EXISTS))
            return;
        const [window] = this.findProjectors();
        if (window) {
            window.unminimize();
            Main.activateWindow(window);
            return;
        }
        if (this.opening)
            return;
        this.opening = Gio.Subprocess.new(
            [GLib.build_filenamev([GLib.get_home_dir(), '.local/bin/ps5-screen'])],
            Gio.SubprocessFlags.NONE
        );
        this.opening.wait_async(null, (process, result) => {
            process.wait_finish(result);
            this.opening = null;
        });
    }

    disable() {
        this.button?.destroy();
        this.button = null;
    }
}
