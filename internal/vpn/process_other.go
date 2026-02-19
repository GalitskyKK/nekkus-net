//go:build !windows

package vpn

import "os/exec"

func setProcessNoWindow(cmd *exec.Cmd) {}
