package errors

import "fmt"

type AppError struct {
	Type    ErrorType
	Message string
	Cause   error
}

type ErrorType string

const (
	ErrorTypeNotFound      ErrorType = "not_found"
	ErrorTypePermission    ErrorType = "permission_denied"
	ErrorTypeValidation    ErrorType = "validation_error"
	ErrorTypeInternal      ErrorType = "internal_error"
	ErrorTypeDatabase      ErrorType = "database_error"
	ErrorTypeSync          ErrorType = "sync_error"
	ErrorTypeWebSocket     ErrorType = "websocket_error"
	ErrorTypeConfiguration ErrorType = "configuration_error"
)

func (e *AppError) Error() string {
	if e.Cause != nil {
		return fmt.Sprintf("%s: %s (caused by: %v)", e.Type, e.Message, e.Cause)
	}
	return fmt.Sprintf("%s: %s", e.Type, e.Message)
}

func (e *AppError) Unwrap() error {
	return e.Cause
}

func NewNotFoundError(message string, cause error) *AppError {
	return &AppError{
		Type:    ErrorTypeNotFound,
		Message: message,
		Cause:   cause,
	}
}

func NewValidationError(message string, cause error) *AppError {
	return &AppError{
		Type:    ErrorTypeValidation,
		Message: message,
		Cause:   cause,
	}
}

func NewDatabaseError(message string, cause error) *AppError {
	return &AppError{
		Type:    ErrorTypeDatabase,
		Message: message,
		Cause:   cause,
	}
}

func NewSyncError(message string, cause error) *AppError {
	return &AppError{
		Type:    ErrorTypeSync,
		Message: message,
		Cause:   cause,
	}
}

func NewInternalError(message string, cause error) *AppError {
	return &AppError{
		Type:    ErrorTypeInternal,
		Message: message,
		Cause:   cause,
	}
}

func NewWebSocketError(message string, cause error) *AppError {
	return &AppError{
		Type:    ErrorTypeWebSocket,
		Message: message,
		Cause:   cause,
	}
}

func NewConfigurationError(message string, cause error) *AppError {
	return &AppError{
		Type:    ErrorTypeConfiguration,
		Message: message,
		Cause:   cause,
	}
}
