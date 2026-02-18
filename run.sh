#!/usr/bin/env bash
# Vibe launcher — fixes GtkFileChooserNative errors on Linux
# Sets GDK_BACKEND=x11 so Electron uses the legacy GTK file dialog
# instead of the XDG portal (GtkFileChooserNative) which crashes

export GDK_BACKEND="${GDK_BACKEND:-x11}"
export ELECTRON_DISABLE_SECURITY_WARNINGS=1

# Optional: suppress VSync GL spam in terminal (redirect stderr filter)
# Uncomment the line below if you still see VSync noise:
# exec npx electron . "$@" 2> >(grep -v 'GetVSyncParametersIfAvailable\|gl_surface_presentation' >&2)

exec npx electron . "$@"
