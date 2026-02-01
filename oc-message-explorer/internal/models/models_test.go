package models

import (
	"testing"
)

func TestMessageTypeValues(t *testing.T) {
	tests := []struct {
		name     string
		expected MessageType
	}{
		{"Init", MessageTypeInit},
		{"Progress", MessageTypeProgress},
		{"Update", MessageTypeUpdate},
		{"Error", MessageTypeError},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if tt.expected == "" {
				t.Errorf("MessageType should not be empty")
			}
		})
	}
}
