//go:build !windows

package vpn

// EnsureChildProcessesKillOnExit — заглушка для не-Windows (реализация только в job_windows.go).
func EnsureChildProcessesKillOnExit() {}
