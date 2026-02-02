package utils

import (
	"testing"
)

func TestGenerateID(t *testing.T) {
	id1 := GenerateID()
	id2 := GenerateID()

	if id1 == id2 {
		t.Error("GenerateID should produce unique IDs")
	}

	if id1 == "" {
		t.Error("ID should not be empty")
	}
}
