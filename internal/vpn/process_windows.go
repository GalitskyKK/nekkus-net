//go:build windows

package vpn

import (
	"os/exec"
	"syscall"
)

// setProcessNoWindow скрывает консоль дочернего процесса на Windows (CREATE_NO_WINDOW).
func setProcessNoWindow(cmd *exec.Cmd) {
	if cmd != nil {
		cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	}
}
